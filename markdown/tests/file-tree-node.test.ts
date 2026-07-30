import { createApp, nextTick, reactive } from "vue";
import { describe, expect, it } from "vitest";
import FileTreeNode from "@/components/explorer/FileTreeNode.vue";
import type { DisplayTreeNode } from "@/stores/workspace";

function createLargeDirectory(childCount: number): DisplayTreeNode {
  return {
    kind: "directory",
    name: "文档",
    path: "docs",
    children: Array.from({ length: childCount }, (_, index) => ({
      kind: "file",
      category: "markdown",
      name: `文档 ${String(index + 1).padStart(3, "0")}.md`,
      path: `docs/document-${index + 1}.md`,
    })),
  };
}

describe("FileTreeNode", () => {
  it("单目录按 200 项分批渲染，并可继续显示后续项目", async () => {
    const container = document.createElement("div");
    const expandedPaths = reactive(new Set<string>(["docs"]));
    const app = createApp(FileTreeNode, {
      node: createLargeDirectory(450),
      depth: 0,
      activePath: "",
      expandedPaths,
    });
    app.mount(container);

    const renderedNodeCount = () =>
      container.querySelectorAll(
        "button.tree-row:not([data-tree-load-more])",
      ).length - 1;
    const loadMoreButton = () =>
      container.querySelector<HTMLButtonElement>("[data-tree-load-more]");

    try {
      expect(renderedNodeCount()).toBe(200);
      expect(container.textContent).toContain("文档 200.md");
      expect(container.textContent).not.toContain("文档 201.md");
      expect(loadMoreButton()?.textContent).toContain(
        "再显示 200 项（剩余 250 项）",
      );

      loadMoreButton()?.click();
      await nextTick();

      expect(renderedNodeCount()).toBe(400);
      expect(container.textContent).toContain("文档 400.md");
      expect(container.textContent).not.toContain("文档 401.md");
      expect(loadMoreButton()?.textContent).toContain(
        "再显示 50 项（剩余 50 项）",
      );

      loadMoreButton()?.click();
      await nextTick();

      expect(renderedNodeCount()).toBe(450);
      expect(container.textContent).toContain("文档 450.md");
      expect(loadMoreButton()).toBeNull();

      expandedPaths.delete("docs");
      await nextTick();
      expandedPaths.add("docs");
      await nextTick();

      expect(renderedNodeCount()).toBe(200);
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it("嵌套文件夹和文件会暴露指针拖动所需的路径", async () => {
    const container = document.createElement("div");
    const app = createApp(FileTreeNode, {
      node: {
        kind: "directory",
        name: "文档",
        path: "docs",
        children: [
          {
            kind: "directory",
            name: "归档",
            path: "docs/archive",
            children: [
              {
                kind: "file",
                category: "markdown",
                name: "会议.md",
                path: "docs/archive/会议.md",
              },
            ],
          },
        ],
      } satisfies DisplayTreeNode,
      depth: 0,
      activePath: "",
      expandedPaths: reactive(new Set<string>(["docs", "docs/archive"])),
    });
    app.mount(container);

    try {
      expect(container.querySelectorAll("[data-tree-path]")).toHaveLength(3);
      expect(
        container.querySelector('[data-tree-path="docs/archive/会议.md"]'),
      ).not.toBeNull();
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
