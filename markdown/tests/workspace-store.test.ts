import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "@/stores/workspace";

describe("workspace store safety barriers", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("saves edits made while a previous snapshot is saving", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();

    store.updateContent("# 第一版");
    const pendingSave = store.saveActiveDocument();
    store.updateContent("# 第二版");

    await expect(pendingSave).resolves.toBe(true);
    expect(store.activeContent).toBe("# 第二版");
    expect(store.activeDocument?.content).toBe("# 第二版");
    expect(store.saveState).toBe("saved");
  });

  it("never leaves unresolved relative image paths in preview HTML", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();

    store.updateContent("![本地草稿](../../private/screenshot.png)");
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 140);
    });

    expect(store.previewHtml).not.toContain("private/screenshot.png");
    expect(store.previewHtml).toContain("图片来源不受支持");
  });

  it("can reveal a panel without toggling an already-open panel closed", () => {
    const store = useWorkspaceStore();

    store.showPanel("search");
    store.showPanel("search");

    expect(store.activePanel).toBe("search");
    expect(store.sidebarOpen).toBe(true);
  });
});
