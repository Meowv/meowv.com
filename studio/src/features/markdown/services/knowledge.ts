import { extractWikiLinks, type WikiLink } from '@/features/markdown/services/markdown';

export interface KnowledgeDocument {
  id?: string;
  path: string;
  title: string;
  content?: string;
  tags?: string[];
  category?: string;
  wikiLinks?: WikiLink[];
}

export interface BacklinkMention {
  raw: string;
  lineNumber: number;
  anchor?: string;
}

export interface Backlink {
  sourceId: string;
  sourcePath: string;
  sourceTitle: string;
  targetId: string;
  targetPath: string;
  targetTitle: string;
  lineNumber: number;
  mentions: BacklinkMention[];
}

export type BacklinkIndex = Record<string, Backlink[]>;

export type KnowledgeGraphNodeType = 'document' | 'tag' | 'category' | 'missing';

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: KnowledgeGraphNodeType;
  path?: string;
  tags?: string[];
  category?: string;
}

export type KnowledgeGraphLinkType = 'wiki' | 'tag' | 'category';

export interface KnowledgeGraphLink {
  source: string;
  target: string;
  type: KnowledgeGraphLinkType;
  label?: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
}

export interface KnowledgeGraphOptions {
  includeTags?: boolean;
  includeCategories?: boolean;
  includeUnresolved?: boolean;
}

interface DocumentResolver {
  documents: KnowledgeDocument[];
  byId: Map<string, KnowledgeDocument>;
  byPath: Map<string, KnowledgeDocument[]>;
  byStemPath: Map<string, KnowledgeDocument[]>;
  byTitle: Map<string, KnowledgeDocument[]>;
  byFileStem: Map<string, KnowledgeDocument[]>;
}

export function documentKnowledgeId(document: KnowledgeDocument): string {
  return document.id?.trim() || normalizeWorkspacePath(document.path);
}

export function resolveWikiLink(
  link: string | Pick<WikiLink, 'target'>,
  documents: readonly KnowledgeDocument[],
  sourceDocument?: KnowledgeDocument,
): KnowledgeDocument | undefined {
  const target = typeof link === 'string' ? link : link.target;
  return resolveWithIndex(target, createDocumentResolver(documents), sourceDocument);
}

export function buildBacklinks(documents: readonly KnowledgeDocument[]): BacklinkIndex {
  const resolver = createDocumentResolver(documents);
  const backlinks: BacklinkIndex = Object.create(null) as BacklinkIndex;

  for (const document of resolver.documents) {
    backlinks[documentKnowledgeId(document)] = [];
  }

  for (const source of resolver.documents) {
    const groupedMentions = new Map<
      string,
      { target: KnowledgeDocument; mentions: BacklinkMention[] }
    >();

    for (const link of linksForDocument(source)) {
      if (link.embedded) {
        continue;
      }

      const target = resolveWithIndex(link.target, resolver, source);
      if (!target) {
        continue;
      }

      const targetId = documentKnowledgeId(target);
      const group = groupedMentions.get(targetId) ?? {
        target,
        mentions: [],
      };
      group.mentions.push({
        raw: link.raw,
        lineNumber: link.lineNumber,
        ...(link.anchor ? { anchor: link.anchor } : {}),
      });
      groupedMentions.set(targetId, group);
    }

    for (const [targetId, group] of groupedMentions) {
      const firstMention = group.mentions[0];
      if (!firstMention) {
        continue;
      }

      backlinks[targetId]?.push({
        sourceId: documentKnowledgeId(source),
        sourcePath: source.path,
        sourceTitle: source.title,
        targetId,
        targetPath: group.target.path,
        targetTitle: group.target.title,
        lineNumber: firstMention.lineNumber,
        mentions: group.mentions,
      });
    }
  }

  for (const items of Object.values(backlinks)) {
    items.sort(
      (left, right) =>
        left.sourceTitle.localeCompare(right.sourceTitle, 'zh-CN') ||
        left.sourcePath.localeCompare(right.sourcePath),
    );
  }

  return backlinks;
}

export function buildKnowledgeGraph(
  documents: readonly KnowledgeDocument[],
  options: KnowledgeGraphOptions = {},
): KnowledgeGraph {
  const { includeTags = false, includeCategories = false, includeUnresolved = false } = options;
  const resolver = createDocumentResolver(documents);
  const nodes = new Map<string, KnowledgeGraphNode>();
  const links = new Map<string, KnowledgeGraphLink>();

  for (const document of resolver.documents) {
    const id = documentKnowledgeId(document);
    nodes.set(id, {
      id,
      label: document.title,
      type: 'document',
      path: document.path,
      ...(document.tags?.length ? { tags: [...document.tags] } : {}),
      ...(document.category ? { category: document.category } : {}),
    });
  }

  for (const source of resolver.documents) {
    const sourceId = documentKnowledgeId(source);

    for (const wikiLink of linksForDocument(source)) {
      if (wikiLink.embedded) {
        continue;
      }

      const target = resolveWithIndex(wikiLink.target, resolver, source);
      let targetId: string;

      if (target) {
        targetId = documentKnowledgeId(target);
      } else if (includeUnresolved) {
        targetId = `missing:${normalizeLookupValue(wikiLink.target)}`;
        if (!nodes.has(targetId)) {
          nodes.set(targetId, {
            id: targetId,
            label: wikiLink.target,
            type: 'missing',
          });
        }
      } else {
        continue;
      }

      const key = graphLinkKey(sourceId, targetId, 'wiki');
      if (!links.has(key)) {
        links.set(key, {
          source: sourceId,
          target: targetId,
          type: 'wiki',
          ...(wikiLink.anchor ? { label: wikiLink.anchor } : {}),
        });
      }
    }

    if (includeTags) {
      for (const tag of normalizedDistinctValues(source.tags)) {
        const targetId = `tag:${normalizeLookupValue(tag)}`;
        if (!nodes.has(targetId)) {
          nodes.set(targetId, {
            id: targetId,
            label: tag,
            type: 'tag',
          });
        }
        links.set(graphLinkKey(sourceId, targetId, 'tag'), {
          source: sourceId,
          target: targetId,
          type: 'tag',
        });
      }
    }

    if (includeCategories && source.category?.trim()) {
      const category = source.category.trim();
      const targetId = `category:${normalizeLookupValue(category)}`;
      if (!nodes.has(targetId)) {
        nodes.set(targetId, {
          id: targetId,
          label: category,
          type: 'category',
        });
      }
      links.set(graphLinkKey(sourceId, targetId, 'category'), {
        source: sourceId,
        target: targetId,
        type: 'category',
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
  };
}

export function countTags(
  documents: readonly KnowledgeDocument[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();

  for (const document of documents) {
    for (const tag of normalizedDistinctValues(document.tags)) {
      const key = normalizeLookupValue(tag);
      const current = counts.get(key);
      counts.set(key, {
        tag: current?.tag ?? tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.tag.localeCompare(right.tag, 'zh-CN'),
  );
}

function createDocumentResolver(documents: readonly KnowledgeDocument[]): DocumentResolver {
  const normalizedDocuments = [...documents].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const resolver: DocumentResolver = {
    documents: normalizedDocuments,
    byId: new Map(),
    byPath: new Map(),
    byStemPath: new Map(),
    byTitle: new Map(),
    byFileStem: new Map(),
  };

  for (const document of normalizedDocuments) {
    resolver.byId.set(normalizeLookupValue(documentKnowledgeId(document)), document);
    addLookupValue(resolver.byPath, normalizeWorkspacePath(document.path), document);
    addLookupValue(
      resolver.byStemPath,
      stripMarkdownExtension(normalizeWorkspacePath(document.path)),
      document,
    );
    addLookupValue(resolver.byTitle, normalizeLookupValue(document.title), document);
    addLookupValue(resolver.byFileStem, normalizeLookupValue(fileStem(document.path)), document);
  }

  return resolver;
}

function resolveWithIndex(
  rawTarget: string,
  resolver: DocumentResolver,
  sourceDocument?: KnowledgeDocument,
): KnowledgeDocument | undefined {
  const target = safeDecodeUriComponent(rawTarget).replace(/\\/gu, '/').replace(/^\/+/u, '').trim();
  if (!target) {
    return undefined;
  }

  const normalizedTarget = normalizeWorkspacePath(target);
  const targetWithExtension = hasMarkdownExtension(normalizedTarget)
    ? normalizedTarget
    : `${normalizedTarget}.md`;
  const targetWithoutExtension = stripMarkdownExtension(normalizedTarget);
  const directCandidates = [
    resolver.byId.get(normalizeLookupValue(target)),
    firstLookup(resolver.byPath, normalizedTarget),
    firstLookup(resolver.byPath, targetWithExtension),
    firstLookup(resolver.byStemPath, targetWithoutExtension),
  ];

  for (const candidate of directCandidates) {
    if (candidate) {
      return candidate;
    }
  }

  if (sourceDocument) {
    const sourceDirectory = directoryName(normalizeWorkspacePath(sourceDocument.path));
    const relativePath = normalizeWorkspacePath(
      sourceDirectory ? `${sourceDirectory}/${target}` : target,
    );
    const relativeWithExtension = hasMarkdownExtension(relativePath)
      ? relativePath
      : `${relativePath}.md`;
    const relativeCandidates = [
      firstLookup(resolver.byPath, relativePath),
      firstLookup(resolver.byPath, relativeWithExtension),
      firstLookup(resolver.byStemPath, stripMarkdownExtension(relativePath)),
    ];

    for (const candidate of relativeCandidates) {
      if (candidate) {
        return candidate;
      }
    }
  }

  return (
    firstLookup(resolver.byTitle, normalizeLookupValue(target)) ??
    firstLookup(resolver.byFileStem, normalizeLookupValue(fileStem(target)))
  );
}

function linksForDocument(document: KnowledgeDocument): WikiLink[] {
  return document.wikiLinks ?? extractWikiLinks(document.content ?? '');
}

function addLookupValue(
  lookup: Map<string, KnowledgeDocument[]>,
  rawKey: string,
  document: KnowledgeDocument,
): void {
  const key = normalizeLookupValue(rawKey);
  const values = lookup.get(key) ?? [];
  values.push(document);
  lookup.set(key, values);
}

function firstLookup(
  lookup: Map<string, KnowledgeDocument[]>,
  key: string,
): KnowledgeDocument | undefined {
  return lookup.get(normalizeLookupValue(key))?.[0];
}

function normalizeWorkspacePath(path: string): string {
  const segments = path.replace(/\\/gu, '/').split('/');
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      normalized.pop();
      continue;
    }

    normalized.push(segment);
  }

  return normalized.join('/');
}

function normalizeLookupValue(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function stripMarkdownExtension(path: string): string {
  return path.replace(/\.(?:md|markdown)$/iu, '');
}

function hasMarkdownExtension(path: string): boolean {
  return /\.(?:md|markdown)$/iu.test(path);
}

function fileStem(path: string): string {
  const fileName = path.replace(/\\/gu, '/').split('/').pop() ?? path;
  return stripMarkdownExtension(fileName);
}

function directoryName(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function normalizedDistinctValues(values: string[] | undefined): string[] {
  const distinct = new Map<string, string>();
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized) {
      distinct.set(normalizeLookupValue(normalized), normalized);
    }
  }
  return [...distinct.values()];
}

function graphLinkKey(source: string, target: string, type: KnowledgeGraphLinkType): string {
  return `${type}\u0000${source}\u0000${target}`;
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
