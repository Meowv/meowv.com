import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const documentLocks = vi.hoisted(() => new Set<string>());
const workspaceHistoryEntries = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const removeWorkspaceHistoryMock = vi.hoisted(() => vi.fn());
const scanWorkspaceMock = vi.hoisted(() => vi.fn());
const openDirectoryMock = vi.hoisted(() => vi.fn());
const createMarkdownFileMock = vi.hoisted(() => vi.fn());
const ensurePermissionMock = vi.hoisted(() => vi.fn());
const recentDirectoryMock = vi.hoisted(() => vi.fn());
const savePreferencesMock = vi.hoisted(() => vi.fn());
const getPreferencesMock = vi.hoisted(() => vi.fn());
const getLastActiveDocumentPathMock = vi.hoisted(() => vi.fn());
const saveLastActiveDocumentPathMock = vi.hoisted(() => vi.fn());
const saveWorkspaceHistoryMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/file-system", async () => {
  const actual = await vi.importActual<typeof import("@/services/file-system")>(
    "@/services/file-system",
  );
  return {
    ...actual,
    openDirectory: openDirectoryMock,
    ensurePermission: ensurePermissionMock,
    readTextFile: vi.fn(async () => "# 会议记录"),
    scanWorkspace: scanWorkspaceMock,
    createMarkdownFile: createMarkdownFileMock,
  };
});

vi.mock("@/services/storage", async () => {
  const actual = await vi.importActual<typeof import("@/services/storage")>(
    "@/services/storage",
  );
  return {
    ...actual,
    isDocumentLocked: vi.fn(async (workspaceName: string, path: string) =>
      documentLocks.has(`${workspaceName}\u0000${path}`),
    ),
    setDocumentLocked: vi.fn(
      async (workspaceName: string, path: string, locked: boolean) => {
        const key = `${workspaceName}\u0000${path}`;
        if (locked) {
          documentLocks.add(key);
        } else {
          documentLocks.delete(key);
        }
      },
    ),
    getWorkspaceHistory: vi.fn(async () => workspaceHistoryEntries),
    getPreferences: getPreferencesMock,
    getLastActiveDocumentPath: getLastActiveDocumentPathMock,
    getRecentDirectory: recentDirectoryMock,
    savePreferences: savePreferencesMock,
    saveLastActiveDocumentPath: saveLastActiveDocumentPathMock,
    saveWorkspaceHistory: saveWorkspaceHistoryMock,
    removeWorkspaceHistory: removeWorkspaceHistoryMock.mockImplementation(
      async (id: string) => {
        const next = workspaceHistoryEntries.filter((entry) => entry.id !== id);
        workspaceHistoryEntries.splice(0, workspaceHistoryEntries.length, ...next);
        return next;
      },
    ),
  };
});

import { useWorkspaceStore } from "@/stores/workspace";

describe("workspace store safety barriers", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    documentLocks.clear();
    workspaceHistoryEntries.splice(0, workspaceHistoryEntries.length);
    removeWorkspaceHistoryMock.mockClear();
    scanWorkspaceMock.mockReset();
    openDirectoryMock.mockReset();
    createMarkdownFileMock.mockReset();
    ensurePermissionMock.mockClear();
    recentDirectoryMock.mockClear();
    savePreferencesMock.mockClear();
    getPreferencesMock.mockClear();
    getLastActiveDocumentPathMock.mockClear();
    saveLastActiveDocumentPathMock.mockClear();
    saveWorkspaceHistoryMock.mockClear();
    ensurePermissionMock.mockResolvedValue(true);
    recentDirectoryMock.mockResolvedValue(null);
    savePreferencesMock.mockImplementation(async (value) => value);
    getPreferencesMock.mockResolvedValue({
      theme: "system",
      autoSaveEnabled: true,
      autoSaveDelay: 2000,
      editorFontSize: 14,
      wordWrap: true,
      lineNumbers: true,
      previewEnabled: true,
      editorVisible: true,
      syncScroll: true,
      sidebarWidth: 280,
      editorWidth: 620,
      restoreRecentWorkspaceOnStartup: true,
    });
    getLastActiveDocumentPathMock.mockResolvedValue(null);
    saveLastActiveDocumentPathMock.mockResolvedValue(undefined);
    saveWorkspaceHistoryMock.mockImplementation(
      async (handle: FileSystemDirectoryHandle) => {
        const entry = {
          id: "recent-workspace",
          name: handle.name,
          handle,
          lastOpenedAt: Date.now(),
        };
        workspaceHistoryEntries.splice(0, workspaceHistoryEntries.length, entry);
        return workspaceHistoryEntries;
      },
    );
  });

  it("手动关闭工作空间后不再自动恢复最近工作空间", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();

    await store.closeWorkspace();

    expect(store.preferences.restoreRecentWorkspaceOnStartup).toBe(false);
    expect(savePreferencesMock).toHaveBeenCalledWith(
      expect.objectContaining({ restoreRecentWorkspaceOnStartup: false }),
    );
  });

  it("在权限仍有效时自动恢复最近工作空间", async () => {
    const handle = {
      kind: "directory",
      name: "会议记录",
    } as FileSystemDirectoryHandle;
    recentDirectoryMock.mockResolvedValue(handle);
    getLastActiveDocumentPathMock.mockResolvedValue("专题.md");
    const readmeHandle = {
      kind: "file",
      name: "README.md",
    } as FileSystemFileHandle;
    const selectedHandle = {
      kind: "file",
      name: "专题.md",
    } as FileSystemFileHandle;
    scanWorkspaceMock.mockResolvedValue({
      root: {
        kind: "directory",
        name: "会议记录",
        path: "",
        handle,
        children: [
          {
            kind: "file",
            name: "README.md",
            path: "README.md",
            category: "markdown",
            extension: ".md",
            handle: readmeHandle,
          },
          {
            kind: "file",
            name: "专题.md",
            path: "专题.md",
            category: "markdown",
            extension: ".md",
            handle: selectedHandle,
          },
        ],
      },
      documents: [
        {
          kind: "file",
          name: "README.md",
          path: "README.md",
          category: "markdown",
          extension: ".md",
          handle: readmeHandle,
        },
        {
          kind: "file",
          name: "专题.md",
          path: "专题.md",
          category: "markdown",
          extension: ".md",
          handle: selectedHandle,
        },
      ],
      assets: [],
    });

    const store = useWorkspaceStore();
    await store.initialize();

    expect(ensurePermissionMock).toHaveBeenCalledWith(
      handle,
      "readwrite",
      false,
    );
    expect(store.workspaceName).toBe("会议记录");
    expect(store.hasWorkspace).toBe(true);
    expect(store.activePath).toBe("专题.md");
  });

  it("手动关闭后，刷新不会自动恢复最近工作空间", async () => {
    const handle = {
      kind: "directory",
      name: "会议记录",
    } as FileSystemDirectoryHandle;
    recentDirectoryMock.mockResolvedValue(handle);
    getPreferencesMock.mockResolvedValue({
      theme: "system",
      autoSaveEnabled: true,
      autoSaveDelay: 2000,
      editorFontSize: 14,
      wordWrap: true,
      lineNumbers: true,
      previewEnabled: true,
      editorVisible: true,
      syncScroll: true,
      sidebarWidth: 280,
      editorWidth: 620,
      restoreRecentWorkspaceOnStartup: false,
    });

    const store = useWorkspaceStore();
    await store.initialize();

    expect(ensurePermissionMock).not.toHaveBeenCalled();
    expect(store.hasWorkspace).toBe(false);
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

  it("locks the active document until it is explicitly unlocked", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();

    store.updateContent("# 已保存的改动");
    await store.toggleActiveDocumentLock();

    expect(store.isActiveDocumentLocked).toBe(true);
    expect(store.activeDocument?.content).toBe("# 已保存的改动");

    store.updateContent("# 不应写入的改动");
    expect(store.activeContent).toBe("# 已保存的改动");

    await store.toggleActiveDocumentLock();
    store.updateContent("# 解锁后的改动");

    expect(store.isActiveDocumentLocked).toBe(false);
    expect(store.activeContent).toBe("# 解锁后的改动");
  });

  it("restores a document lock after the workspace is loaded again", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();
    await store.toggleActiveDocumentLock();

    await store.loadDemoWorkspace();

    expect(store.isActiveDocumentLocked).toBe(true);
  });

  it("can reveal a panel without toggling an already-open panel closed", () => {
    const store = useWorkspaceStore();

    store.showPanel("search");
    store.showPanel("search");

    expect(store.activePanel).toBe("search");
    expect(store.sidebarOpen).toBe(true);
  });

  it("removes an unavailable history entry without switching workspaces", async () => {
    const store = useWorkspaceStore();
    await store.loadDemoWorkspace();

    const missingEntry = {
      id: "missing-workspace",
      name: "已删除工作空间",
      handle: {
        kind: "directory",
        name: "已删除工作空间",
      } as FileSystemDirectoryHandle,
      lastOpenedAt: Date.now(),
    };
    store.workspaceHistory = [missingEntry];
    scanWorkspaceMock.mockRejectedValueOnce(
      new DOMException("目录不存在", "NotFoundError"),
    );

    await store.openWorkspaceHistory(missingEntry.id);

    expect(store.isDemo).toBe(true);
    expect(store.workspaceHistory).toEqual([]);
    expect(removeWorkspaceHistoryMock).toHaveBeenCalledWith(missingEntry.id);
    expect(store.toasts.at(-1)).toMatchObject({
      title: "工作空间已不存在",
      message: expect.stringContaining("已从历史记录移除"),
    });
  });

  it("starts an editable untitled draft for a workspace without Markdown files", async () => {
    const rootHandle = {
      kind: "directory",
      name: "空工作空间",
    } as FileSystemDirectoryHandle;
    const draftFileHandle = {
      kind: "file",
      name: "会议记录.md",
      getFile: async () => new File(["# 会议记录"], "会议记录.md"),
    } as FileSystemFileHandle;
    const emptyWorkspace = {
      root: {
        kind: "directory",
        name: "空工作空间",
        path: "",
        handle: rootHandle,
        children: [],
      },
      documents: [],
      assets: [],
    };
    const savedWorkspace = {
      root: {
        kind: "directory",
        name: "空工作空间",
        path: "",
        handle: rootHandle,
        children: [
          {
            kind: "file",
            name: "会议记录.md",
            path: "会议记录.md",
            category: "markdown",
            extension: ".md",
            handle: draftFileHandle,
          },
        ],
      },
      documents: [
        {
          kind: "file",
          name: "会议记录.md",
          path: "会议记录.md",
          category: "markdown",
          extension: ".md",
          handle: draftFileHandle,
        },
      ],
      assets: [],
    };
    openDirectoryMock.mockResolvedValueOnce(rootHandle);
    scanWorkspaceMock
      .mockResolvedValueOnce(emptyWorkspace)
      .mockResolvedValueOnce(savedWorkspace);
    createMarkdownFileMock.mockResolvedValueOnce(draftFileHandle);

    const store = useWorkspaceStore();
    await store.openLocalWorkspace();

    expect(store.untitledDraft).toBe(true);
    expect(store.hasEditableDocument).toBe(true);
    store.updateContent("# 会议记录");
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 140);
    });
    expect(store.previewHtml).toContain("会议记录");
    await expect(store.saveActiveDocument()).resolves.toBe(false);
    expect(store.draftSaveRequested).toBe(true);

    await expect(store.saveUntitledDraft("会议记录")).resolves.toBe(true);
    expect(createMarkdownFileMock).toHaveBeenCalledWith(
      rootHandle,
      "会议记录.md",
      "# 会议记录",
    );
    expect(store.untitledDraft).toBe(false);
    expect(store.activePath).toBe("会议记录.md");

    scanWorkspaceMock.mockResolvedValueOnce(emptyWorkspace);
    await store.refreshWorkspace();

    expect(store.untitledDraft).toBe(true);
    expect(store.activePath).toBe("");
    expect(store.hasEditableDocument).toBe(true);
  });
});
