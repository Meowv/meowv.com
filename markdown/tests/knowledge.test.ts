import {
  buildBacklinks,
  buildKnowledgeGraph,
  countTags,
  resolveWikiLink,
  type KnowledgeDocument,
} from "@/services/knowledge";
import { describe, expect, it } from "vitest";

const documents: KnowledgeDocument[] = [
  {
    path: "database/EFCore.md",
    title: "EF Core 优化",
    tags: [".NET", "EFCore"],
    category: "Backend",
    content: "# EF Core 优化\n\n参见 [[SQL索引]] 和 [[SQL索引#组合索引]]。",
  },
  {
    path: "database/SQL索引.md",
    title: "SQL 索引",
    tags: ["SQL", ".NET"],
    category: "Backend",
    content: "# SQL 索引\n\n返回 [[EF Core 优化]]。",
  },
  {
    path: "notes/总结.md",
    title: "性能总结",
    tags: ["EFCore"],
    content: "阅读 [[../database/EFCore.md|EF Core]]。",
  },
];

describe("知识关系服务", () => {
  it("按标题、文件名和相对路径解析双向链接", () => {
    expect(resolveWikiLink("SQL索引", documents)?.path).toBe(
      "database/SQL索引.md",
    );
    expect(resolveWikiLink("EF Core 优化", documents)?.path).toBe(
      "database/EFCore.md",
    );
    expect(
      resolveWikiLink("../database/EFCore.md", documents, documents[2])?.path,
    ).toBe("database/EFCore.md");
  });

  it("生成按目标文档分组并合并重复引用的 backlinks", () => {
    const backlinks = buildBacklinks(documents);
    const sqlBacklinks = backlinks["database/SQL索引.md"];

    expect(sqlBacklinks).toHaveLength(1);
    expect(sqlBacklinks?.[0]).toMatchObject({
      sourcePath: "database/EFCore.md",
      targetPath: "database/SQL索引.md",
      lineNumber: 3,
    });
    expect(sqlBacklinks?.[0]?.mentions).toHaveLength(2);
    expect(
      backlinks["database/EFCore.md"]?.map((item) => item.sourcePath),
    ).toEqual(
      expect.arrayContaining(["database/SQL索引.md", "notes/总结.md"]),
    );
  });

  it("生成 D3 可直接消费的节点和 source/target 关系", () => {
    const graph = buildKnowledgeGraph(documents, {
      includeTags: true,
      includeCategories: true,
      includeUnresolved: true,
    });

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: "database/EFCore.md",
        type: "document",
      }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({ id: "tag:.net", type: "tag" }),
    );
    expect(graph.links).toContainEqual({
      source: "database/EFCore.md",
      target: "database/SQL索引.md",
      type: "wiki",
    });
    expect(graph.links).toContainEqual({
      source: "database/EFCore.md",
      target: "tag:.net",
      type: "tag",
    });
  });

  it("统计标签时忽略同文档内的大小写重复", () => {
    expect(
      countTags([
        ...documents,
        {
          path: "case.md",
          title: "case",
          tags: ["SQL", "sql"],
        },
      ]),
    ).toEqual([
      { tag: ".NET", count: 2 },
      { tag: "EFCore", count: 2 },
      { tag: "SQL", count: 2 },
    ]);
  });
});
