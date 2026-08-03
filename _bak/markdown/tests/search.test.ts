import {
  SearchController,
  SearchEngine,
  searchDocuments,
  type SearchDocument,
  type SearchWorkerRequest,
  type SearchWorkerResponse,
} from "@/services/search";
import { describe, expect, it, vi } from "vitest";

const documents: SearchDocument[] = [
  {
    path: "database/efcore.md",
    title: "EF Core 性能优化",
    tags: [".NET", "EFCore"],
    content: `# EF Core 性能优化

普通内容。

使用 IQueryable 延迟执行查询。`,
  },
  {
    path: "database/redis.md",
    title: "Redis 缓存",
    tags: ["Redis"],
    content: "# Redis\n\n缓存穿透与缓存雪崩。",
  },
];

class AcknowledgingWorker {
  onmessage: Worker["onmessage"] = null;
  onmessageerror: Worker["onmessageerror"] = null;
  onerror: Worker["onerror"] = null;
  readonly terminate = vi.fn();

  postMessage(message: SearchWorkerRequest): void {
    queueMicrotask(() => {
      this.onmessage?.call(
        this as unknown as Worker,
        new MessageEvent<SearchWorkerResponse>("message", {
          data: {
            requestId: message.requestId,
            ok: true,
          },
        }),
      );
    });
  }

  fail(): void {
    this.onerror?.call(
      this as unknown as Worker,
      new ErrorEvent("error", {
        message: "测试 Worker 失效",
      }),
    );
  }
}

describe("Markdown 搜索服务", () => {
  it("索引 title/content/path/tags 并返回片段与原始行号", () => {
    const engine = new SearchEngine(documents);
    const [result] = engine.search("IQueryable");

    expect(engine.size).toBe(2);
    expect(result).toMatchObject({
      path: "database/efcore.md",
      title: "EF Core 性能优化",
      lineNumber: 5,
      columnNumber: 4,
    });
    expect(result?.snippet).toContain("IQueryable");
    expect(result?.matchedFields).toContain("content");
  });

  it("支持中文子词、标签和路径搜索", () => {
    const engine = new SearchEngine(documents);

    expect(engine.search("优化")[0]?.path).toBe("database/efcore.md");
    expect(engine.search("Redis")[0]?.tags).toContain("Redis");
    expect(engine.search("database")[0]?.path).toBe("database/efcore.md");
  });

  it("支持增量更新、删除和纯函数式一次性搜索", () => {
    const engine = new SearchEngine();
    engine.upsert(documents[0]!);
    expect(engine.search("IQueryable")).toHaveLength(1);

    engine.upsert({
      ...documents[0]!,
      content: "# EF Core\n\nCompiled Query",
    });
    expect(engine.search("IQueryable")).toHaveLength(0);
    expect(engine.search("Compiled Query")).toHaveLength(1);

    engine.remove("database/efcore.md");
    expect(engine.size).toBe(0);
    expect(searchDocuments(documents, "缓存")).toHaveLength(1);
  });

  it("Worker 不可用时自动使用同步索引回退", async () => {
    const controller = new SearchController({
      workerFactory: () => null,
    });

    await controller.replaceAll(documents);
    expect(controller.usesWorker).toBe(false);
    expect(controller.searchSync("IQueryable")[0]?.lineNumber).toBe(5);
    await expect(controller.search("缓存")).resolves.toHaveLength(1);

    controller.dispose();
  });

  it("Worker 可用时不在主线程建索引，并在失效后按最新源文档重建一次", async () => {
    const worker = new AcknowledgingWorker();
    const replaceAll = vi.spyOn(SearchEngine.prototype, "replaceAll");
    const controller = new SearchController({
      workerFactory: () => worker as unknown as Worker,
    });

    try {
      await controller.replaceAll(documents);
      await controller.upsert({
        ...documents[0]!,
        content: "# EF Core\n\nWorker fallback marker",
      });
      await controller.remove("database/redis.md");

      expect(controller.usesWorker).toBe(true);
      expect(controller.size).toBe(1);
      expect(replaceAll).not.toHaveBeenCalled();

      worker.fail();

      expect(controller.usesWorker).toBe(false);
      expect(replaceAll).toHaveBeenCalledTimes(1);
      expect(controller.searchSync("IQueryable")).toHaveLength(0);
      expect(controller.searchSync("fallback marker")[0]?.path).toBe(
        "database/efcore.md",
      );
    } finally {
      controller.dispose();
      replaceAll.mockRestore();
    }
  });
});
