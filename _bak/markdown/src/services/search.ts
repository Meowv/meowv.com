import MiniSearch, {
  type SearchOptions as MiniSearchOptions,
  type SearchResult as MiniSearchResult,
} from "minisearch";

export interface SearchDocument {
  id?: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
}

export interface SearchQueryOptions {
  limit?: number;
  prefix?: boolean;
  fuzzy?: boolean | number;
  maxSnippetLength?: number;
}

export interface MarkdownSearchResult {
  id: string;
  path: string;
  title: string;
  tags: string[];
  score: number;
  snippet: string;
  lineNumber: number;
  columnNumber: number;
  matchedTerms: string[];
  matchedFields: string[];
}

export type SearchWorkerCommand =
  | { type: "replace"; documents: SearchDocument[] }
  | { type: "upsert"; document: SearchDocument }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "search"; query: string; options?: SearchQueryOptions };

export type SearchWorkerRequest = SearchWorkerCommand & {
  requestId: string;
};

export type SearchWorkerResponse =
  | {
      requestId: string;
      ok: true;
      result?: MarkdownSearchResult[];
    }
  | {
      requestId: string;
      ok: false;
      error: string;
    };

export interface SearchControllerOptions {
  workerFactory?: () => Worker | null;
  requestTimeoutMs?: number;
}

interface IndexedSearchDocument {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
}

interface SnippetMatch {
  snippet: string;
  lineNumber: number;
  columnNumber: number;
}

interface PendingWorkerRequest {
  resolve: (result: MarkdownSearchResult[] | undefined) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const INDEX_FIELDS = ["title", "content", "path", "tags"];
const STORED_FIELDS = ["title", "path", "tags"];
const DEFAULT_RESULT_LIMIT = 50;
const DEFAULT_SNIPPET_LENGTH = 180;
const DEFAULT_WORKER_TIMEOUT = 5_000;

export class SearchEngine {
  private index: MiniSearch<IndexedSearchDocument>;
  private readonly documents = new Map<string, IndexedSearchDocument>();

  constructor(documents: readonly SearchDocument[] = []) {
    this.index = createMiniSearch();
    this.replaceAll(documents);
  }

  get size(): number {
    return this.documents.size;
  }

  replaceAll(documents: readonly SearchDocument[]): void {
    const normalized = deduplicateDocuments(documents);
    this.documents.clear();
    this.index = createMiniSearch();

    for (const document of normalized) {
      this.documents.set(document.id, document);
    }
    if (normalized.length > 0) {
      this.index.addAll(normalized);
    }
  }

  upsert(document: SearchDocument): void {
    const normalized = normalizeDocument(document);
    if (this.documents.has(normalized.id)) {
      this.index.replace(normalized);
    } else {
      this.index.add(normalized);
    }
    this.documents.set(normalized.id, normalized);
  }

  remove(id: string): void {
    const normalizedId = id.trim();
    if (!normalizedId || !this.documents.has(normalizedId)) {
      return;
    }

    this.index.discard(normalizedId);
    this.documents.delete(normalizedId);
  }

  clear(): void {
    this.documents.clear();
    this.index.removeAll();
  }

  search(
    rawQuery: string,
    options: SearchQueryOptions = {},
  ): MarkdownSearchResult[] {
    const query = rawQuery.trim();
    if (!query) {
      return [];
    }

    const limit = clampPositiveInteger(
      options.limit,
      DEFAULT_RESULT_LIMIT,
      500,
    );
    const maxSnippetLength = clampPositiveInteger(
      options.maxSnippetLength,
      DEFAULT_SNIPPET_LENGTH,
      500,
    );
    const searchOptions: MiniSearchOptions = {
      boost: {
        title: 4,
        tags: 2.5,
        path: 1.5,
        content: 1,
      },
      combineWith: "OR",
      prefix: options.prefix ?? true,
      fuzzy:
        options.fuzzy ??
        ((term: string): boolean | number =>
          term.length >= 5 ? 0.2 : false),
    };

    return this.index
      .search(query, searchOptions)
      .slice(0, limit)
      .flatMap((result) => {
        const document = this.documents.get(String(result.id));
        if (!document) {
          return [];
        }

        const matchedTerms = distinctNormalizedValues([
          query,
          ...result.terms,
          ...result.queryTerms,
        ]);
        const snippet = createSnippet(
          document.content,
          matchedTerms,
          maxSnippetLength,
          document,
        );

        return [
          {
            id: document.id,
            path: document.path,
            title: document.title,
            tags: [...document.tags],
            score: result.score,
            snippet: snippet.snippet,
            lineNumber: snippet.lineNumber,
            columnNumber: snippet.columnNumber,
            matchedTerms: distinctNormalizedValues(result.terms),
            matchedFields: matchedFieldNames(result),
          },
        ];
      });
  }
}

export class SearchController {
  private readonly sourceDocuments = new Map<string, IndexedSearchDocument>();
  private readonly requestTimeoutMs: number;
  private readonly pending = new Map<string, PendingWorkerRequest>();
  private fallback: SearchEngine | null = null;
  private worker: Worker | null = null;
  private requestSequence = 0;

  constructor(options: SearchControllerOptions = {}) {
    this.requestTimeoutMs = clampPositiveInteger(
      options.requestTimeoutMs,
      DEFAULT_WORKER_TIMEOUT,
      60_000,
    );

    try {
      this.worker = options.workerFactory
        ? options.workerFactory()
        : createDefaultSearchWorker();
    } catch {
      this.worker = null;
    }

    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = () => {
        this.disableWorker(new Error("搜索 Worker 运行失败，已切换为同步搜索。"));
      };
      this.worker.onmessageerror = () => {
        this.disableWorker(new Error("搜索 Worker 返回了无效消息，已切换为同步搜索。"));
      };
    } else {
      this.fallback = new SearchEngine();
    }
  }

  get usesWorker(): boolean {
    return this.worker !== null;
  }

  get size(): number {
    return this.sourceDocuments.size;
  }

  async replaceAll(documents: readonly SearchDocument[]): Promise<void> {
    const normalized = deduplicateDocuments(documents);
    this.sourceDocuments.clear();
    for (const document of normalized) {
      this.sourceDocuments.set(document.id, document);
    }
    this.fallback?.replaceAll(normalized);

    if (!this.worker) {
      this.ensureFallback();
      return;
    }

    await this.sendMutation({
      type: "replace",
      documents: normalized.map(cloneSearchDocument),
    });
  }

  async upsert(document: SearchDocument): Promise<void> {
    const normalized = normalizeDocument(document);
    this.sourceDocuments.set(normalized.id, normalized);
    this.fallback?.upsert(normalized);

    if (!this.worker) {
      this.ensureFallback();
      return;
    }

    await this.sendMutation({
      type: "upsert",
      document: cloneSearchDocument(normalized),
    });
  }

  async remove(id: string): Promise<void> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return;
    }

    this.sourceDocuments.delete(normalizedId);
    this.fallback?.remove(normalizedId);

    if (!this.worker) {
      this.ensureFallback();
      return;
    }

    await this.sendMutation({ type: "remove", id: normalizedId });
  }

  async clear(): Promise<void> {
    this.sourceDocuments.clear();
    this.fallback?.clear();

    if (!this.worker) {
      this.ensureFallback();
      return;
    }

    await this.sendMutation({ type: "clear" });
  }

  searchSync(
    query: string,
    options: SearchQueryOptions = {},
  ): MarkdownSearchResult[] {
    return this.ensureFallback().search(query, options);
  }

  async search(
    query: string,
    options: SearchQueryOptions = {},
  ): Promise<MarkdownSearchResult[]> {
    if (!this.worker) {
      return this.searchSync(query, options);
    }

    try {
      return (
        (await this.requestWorker({
          type: "search",
          query,
          options,
        })) ?? []
      );
    } catch {
      return this.searchSync(query, options);
    }
  }

  dispose(): void {
    this.disableWorker(new Error("搜索服务已关闭。"), false);
  }

  private async sendMutation(command: SearchWorkerCommand): Promise<void> {
    if (!this.worker) {
      return;
    }

    try {
      await this.requestWorker(command);
    } catch (error) {
      this.disableWorker(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private requestWorker(
    command: SearchWorkerCommand,
  ): Promise<MarkdownSearchResult[] | undefined> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error("搜索 Worker 不可用。"));
    }

    const requestId = `search-${Date.now()}-${this.requestSequence}`;
    this.requestSequence += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        const error = new Error("搜索 Worker 响应超时，已切换为同步搜索。");
        reject(error);
        this.disableWorker(error);
      }, this.requestTimeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });

      try {
        worker.postMessage({ ...command, requestId } satisfies SearchWorkerRequest);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        reject(normalizedError);
        this.disableWorker(normalizedError);
      }
    });
  }

  private handleWorkerMessage(response: SearchWorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error));
    }
  }

  private ensureFallback(): SearchEngine {
    this.fallback ??= new SearchEngine([...this.sourceDocuments.values()]);
    return this.fallback;
  }

  private disableWorker(error: Error, rebuildFallback = true): void {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();

    if (rebuildFallback) {
      this.ensureFallback();
    }

    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }
}

export function createSearchController(
  options: SearchControllerOptions = {},
): SearchController {
  return new SearchController(options);
}

export function searchDocuments(
  documents: readonly SearchDocument[],
  query: string,
  options: SearchQueryOptions = {},
): MarkdownSearchResult[] {
  return new SearchEngine(documents).search(query, options);
}

function createMiniSearch(): MiniSearch<IndexedSearchDocument> {
  return new MiniSearch<IndexedSearchDocument>({
    fields: INDEX_FIELDS,
    idField: "id",
    storeFields: STORED_FIELDS,
    tokenize: tokenizeSearchText,
    processTerm: (term) => normalizeSearchText(term),
  });
}

function createDefaultSearchWorker(): Worker | null {
  if (typeof Worker === "undefined") {
    return null;
  }

  return new Worker(new URL("../workers/search.worker.ts", import.meta.url), {
    type: "module",
    name: "markdown-search",
  });
}

function tokenizeSearchText(text: string): string[] {
  const words =
    normalizeSearchText(text).match(/[\p{L}\p{N}_+#.-]+/gu) ?? [];
  const terms = new Set<string>();

  for (const word of words) {
    terms.add(word);
    for (const segment of word.match(/\p{Script=Han}+/gu) ?? []) {
      if (segment.length === 1) {
        terms.add(segment);
        continue;
      }

      for (let index = 0; index < segment.length - 1; index += 1) {
        terms.add(segment.slice(index, index + 2));
      }
    }
  }

  return [...terms];
}

function normalizeDocument(document: SearchDocument): IndexedSearchDocument {
  const path = document.path.trim();
  const id = document.id?.trim() || path;

  if (!id) {
    throw new Error("搜索文档必须提供非空 id 或 path。");
  }

  return {
    id,
    path,
    title: document.title.trim() || fileNameFromPath(path),
    content: document.content,
    tags: distinctDisplayValues(document.tags),
  };
}

function deduplicateDocuments(
  documents: readonly SearchDocument[],
): IndexedSearchDocument[] {
  const byId = new Map<string, IndexedSearchDocument>();
  for (const document of documents) {
    const normalized = normalizeDocument(document);
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

function createSnippet(
  content: string,
  matchedTerms: readonly string[],
  maxLength: number,
  document: IndexedSearchDocument,
): SnippetMatch {
  const lines = content.split(/\r?\n/u);
  let best:
    | {
        line: string;
        lineIndex: number;
        columnIndex: number;
        score: number;
      }
    | undefined;

  lines.forEach((line, lineIndex) => {
    const normalizedLine = normalizeSearchText(line);
    let score = 0;
    let columnIndex = -1;

    matchedTerms.forEach((term, termIndex) => {
      const normalizedTerm = normalizeSearchText(term);
      if (!normalizedTerm) {
        return;
      }

      const position = normalizedLine.indexOf(normalizedTerm);
      if (position < 0) {
        return;
      }

      score += termIndex === 0 ? 10 : 1;
      if (columnIndex < 0 || position < columnIndex) {
        columnIndex = position;
      }
    });

    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score && lineIndex < best.lineIndex))
    ) {
      best = { line, lineIndex, columnIndex, score };
    }
  });

  if (!best) {
    const fallback = document.title || document.path || document.tags.join(", ");
    return {
      snippet: truncateAround(fallback, 0, maxLength),
      lineNumber: 1,
      columnNumber: 1,
    };
  }

  const plainLine = cleanSnippetLine(best.line);
  const adjustedColumn = Math.min(best.columnIndex, plainLine.length);

  return {
    snippet: truncateAround(plainLine, adjustedColumn, maxLength),
    lineNumber: best.lineIndex + 1,
    columnNumber: best.columnIndex + 1,
  };
}

function cleanSnippetLine(line: string): string {
  const cleaned = line
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/u, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .trim();

  return cleaned || line.trim();
}

function truncateAround(
  value: string,
  rawMatchIndex: number,
  maxLength: number,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  const matchIndex = Math.max(0, Math.min(rawMatchIndex, value.length - 1));
  const start = Math.max(
    0,
    Math.min(
      matchIndex - Math.floor(maxLength / 3),
      value.length - maxLength,
    ),
  );
  const end = Math.min(value.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${value.slice(start, end).trim()}${
    end < value.length ? "…" : ""
  }`;
}

function matchedFieldNames(result: MiniSearchResult): string[] {
  const fields = new Set<string>();
  for (const matchedFields of Object.values(result.match)) {
    for (const field of matchedFields) {
      fields.add(field);
    }
  }
  return [...fields];
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function distinctNormalizedValues(values: readonly string[]): string[] {
  const distinct = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeSearchText(value).trim();
    if (normalized) {
      distinct.set(normalized, value);
    }
  }
  return [...distinct.values()];
}

function distinctDisplayValues(values: readonly string[]): string[] {
  const distinct = new Map<string, string>();
  for (const value of values) {
    const displayValue = value.trim();
    if (displayValue) {
      distinct.set(normalizeSearchText(displayValue), displayValue);
    }
  }
  return [...distinct.values()];
}

function cloneSearchDocument(document: SearchDocument): SearchDocument {
  return {
    ...(document.id ? { id: document.id } : {}),
    path: document.path,
    title: document.title,
    content: document.content,
    tags: [...document.tags],
  };
}

function fileNameFromPath(path: string): string {
  return path.replace(/\\/gu, "/").split("/").pop() ?? path;
}

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), maximum);
}
