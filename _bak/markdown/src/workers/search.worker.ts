/// <reference lib="webworker" />

import {
  SearchEngine,
  type MarkdownSearchResult,
  type SearchWorkerRequest,
  type SearchWorkerResponse,
} from "@/services/search";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const searchEngine = new SearchEngine();

workerScope.addEventListener(
  "message",
  (event: MessageEvent<SearchWorkerRequest>) => {
    const request = event.data;

    try {
      let result: MarkdownSearchResult[] | undefined;

      switch (request.type) {
        case "replace":
          searchEngine.replaceAll(request.documents);
          break;
        case "upsert":
          searchEngine.upsert(request.document);
          break;
        case "remove":
          searchEngine.remove(request.id);
          break;
        case "clear":
          searchEngine.clear();
          break;
        case "search":
          result = searchEngine.search(request.query, request.options);
          break;
        default:
          assertNever(request);
      }

      workerScope.postMessage({
        requestId: request.requestId,
        ok: true,
        ...(result ? { result } : {}),
      } satisfies SearchWorkerResponse);
    } catch (error) {
      workerScope.postMessage({
        requestId: request.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies SearchWorkerResponse);
    }
  },
);

function assertNever(value: never): never {
  throw new Error(`不支持的搜索操作：${String(value)}`);
}
