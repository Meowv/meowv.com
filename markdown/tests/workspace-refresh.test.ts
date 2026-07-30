import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceScanResult } from "@/types/workspace";

const fileSystemMocks = vi.hoisted(() => ({
  openDirectory: vi.fn(),
  readTextFile: vi.fn(),
  scanWorkspace: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@/services/file-system", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/file-system")
  >("@/services/file-system");
  return {
    ...actual,
    openDirectory: fileSystemMocks.openDirectory,
    readTextFile: fileSystemMocks.readTextFile,
    scanWorkspace: fileSystemMocks.scanWorkspace,
    writeTextFile: fileSystemMocks.writeTextFile,
  };
});

vi.mock("@/services/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/storage")
  >("@/services/storage");
  return {
    ...actual,
    getPreferences: vi.fn().mockResolvedValue({
      autoSaveDelay: 800,
      autoSaveEnabled: true,
      editorFontSize: 14,
      syncScroll: true,
      theme: "light",
    }),
    getRecentDirectory: vi.fn().mockResolvedValue(null),
    savePreferences: vi.fn(async (value) => value),
    saveRecentDirectory: vi.fn().mockResolvedValue(undefined),
  };
});

import { useWorkspaceStore } from "@/stores/workspace";

describe("workspace refresh", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("keeps edits made while a fresh disk snapshot is being scanned", async () => {
    const rootHandle = {
      kind: "directory",
      name: "Notes",
    } as FileSystemDirectoryHandle;
    const fileHandle = {
      kind: "file",
      name: "README.md",
    } as FileSystemFileHandle;
    const scanResult: WorkspaceScanResult = {
      root: {
        kind: "directory",
        name: "Notes",
        path: "",
        handle: rootHandle,
        children: [
          {
            kind: "file",
            name: "README.md",
            path: "README.md",
            extension: ".md",
            category: "markdown",
            handle: fileHandle,
          },
        ],
      },
      documents: [
        {
          kind: "file",
          name: "README.md",
          path: "README.md",
          extension: ".md",
          category: "markdown",
          handle: fileHandle,
        },
      ],
      assets: [],
    };

    let finishRefreshScan:
      | ((result: WorkspaceScanResult) => void)
      | undefined;
    fileSystemMocks.openDirectory.mockResolvedValue(rootHandle);
    fileSystemMocks.readTextFile.mockResolvedValue("# 磁盘版本");
    fileSystemMocks.scanWorkspace
      .mockResolvedValueOnce(scanResult)
      .mockImplementationOnce(
        () =>
          new Promise<WorkspaceScanResult>((resolve) => {
            finishRefreshScan = resolve;
          }),
      );

    const store = useWorkspaceStore();
    await store.openLocalWorkspace();
    expect(store.activeContent).toBe("# 磁盘版本");

    const refresh = store.refreshWorkspace();
    await vi.waitFor(() => {
      expect(fileSystemMocks.scanWorkspace).toHaveBeenCalledTimes(2);
    });
    store.updateContent("# 扫描期间的新输入");
    finishRefreshScan?.(scanResult);
    await refresh;

    expect(store.activeContent).toBe("# 扫描期间的新输入");
    expect(store.activeDocument?.content).toBe("# 扫描期间的新输入");
    expect(store.saveState).toBe("dirty");
    await expect(store.saveActiveDocument()).resolves.toBe(true);
    expect(fileSystemMocks.writeTextFile).toHaveBeenCalledWith(
      fileHandle,
      "# 扫描期间的新输入",
    );
    store.dispose();
  });
});
