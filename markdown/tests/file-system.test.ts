import { describe, expect, it } from "vitest";
import {
  createMarkdownFile,
  deleteEntry,
  findEntryByPath,
  getDirectoryHandleByRelativePath,
  getFileHandleByRelativePath,
  normalizeWorkspacePath,
  readTextFile,
  renameEntry,
  resolveRelativePath,
  scanWorkspace,
  toWorkspaceError,
  writeTextFile,
} from "../src/services/file-system";
import { WorkspaceError } from "../src/types/workspace";

type VirtualEntry = VirtualDirectory | VirtualFile;

interface PermissionOptions {
  permission?: PermissionState;
  failRead?: boolean;
}

class VirtualFile {
  readonly kind = "file" as const;
  permission: PermissionState;
  content: string;
  readonly failRead: boolean;

  constructor(
    readonly name: string,
    content = "",
    options: PermissionOptions = {},
  ) {
    this.content = content;
    this.permission = options.permission ?? "granted";
    this.failRead = options.failRead ?? false;
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async getFile(): Promise<File> {
    if (this.failRead) {
      throw new DOMException("Unreadable", "NotReadableError");
    }

    const content = this.content;
    return {
      name: this.name,
      size: new TextEncoder().encode(content).byteLength,
      type: "text/plain",
      lastModified: 0,
      text: async () => content,
      arrayBuffer: async () =>
        new TextEncoder().encode(content).buffer as ArrayBuffer,
    } as File;
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let pending = this.content;
    let aborted = false;

    return {
      write: async (data: FileSystemWriteChunkType) => {
        if (typeof data === "string") {
          pending = data;
          return;
        }

        if (
          typeof data === "object" &&
          data !== null &&
          "text" in data &&
          typeof data.text === "function"
        ) {
          pending = await data.text();
          return;
        }

        if (data instanceof ArrayBuffer) {
          pending = new TextDecoder().decode(data);
          return;
        }

        if (ArrayBuffer.isView(data)) {
          pending = new TextDecoder().decode(data);
          return;
        }

        throw new TypeError("Unsupported virtual write");
      },
      close: async () => {
        if (!aborted) {
          this.content = pending;
        }
      },
      abort: async () => {
        aborted = true;
      },
    } as FileSystemWritableFileStream;
  }

  asHandle(): FileSystemFileHandle {
    return this as unknown as FileSystemFileHandle;
  }
}

class VirtualDirectory {
  readonly kind = "directory" as const;
  readonly children = new Map<string, VirtualEntry>();
  permission: PermissionState;

  constructor(
    readonly name: string,
    entries: VirtualEntry[] = [],
    options: PermissionOptions = {},
  ) {
    this.permission = options.permission ?? "granted";
    for (const entry of entries) {
      this.children.set(entry.name, entry);
    }
  }

  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this;
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async *entries(): AsyncGenerator<[string, FileSystemHandle]> {
    for (const entry of this.children.values()) {
      yield [
        entry.name,
        entry.kind === "directory" ? entry.asHandle() : entry.asHandle(),
      ];
    }
  }

  async getFileHandle(
    name: string,
    options: FileSystemGetFileOptions = {},
  ): Promise<FileSystemFileHandle> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== "file") {
        throw new DOMException("Wrong kind", "TypeMismatchError");
      }
      return existing.asHandle();
    }
    if (!options.create) {
      throw new DOMException("Missing", "NotFoundError");
    }

    const created = new VirtualFile(name);
    this.children.set(name, created);
    return created.asHandle();
  }

  async getDirectoryHandle(
    name: string,
    options: FileSystemGetDirectoryOptions = {},
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== "directory") {
        throw new DOMException("Wrong kind", "TypeMismatchError");
      }
      return existing.asHandle();
    }
    if (!options.create) {
      throw new DOMException("Missing", "NotFoundError");
    }

    const created = new VirtualDirectory(name);
    this.children.set(name, created);
    return created.asHandle();
  }

  async removeEntry(
    name: string,
    options: FileSystemRemoveOptions = {},
  ): Promise<void> {
    const existing = this.children.get(name);
    if (!existing) {
      throw new DOMException("Missing", "NotFoundError");
    }
    if (
      existing.kind === "directory" &&
      existing.children.size > 0 &&
      !options.recursive
    ) {
      throw new DOMException("Directory not empty", "InvalidModificationError");
    }
    this.children.delete(name);
  }

  async resolve(): Promise<string[] | null> {
    return null;
  }

  asHandle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}

describe("file-system", () => {
  it("递归生成只含 Markdown 的文档树，同时单独收集图片", async () => {
    const root = new VirtualDirectory("Blog", [
      new VirtualFile("README.md", "# Hello"),
      new VirtualFile("ignored.txt", "ignore"),
      new VirtualDirectory("技术", [
        new VirtualFile("EFCore.MARKDOWN", "# EFCore"),
        new VirtualFile("chart.png", "image bytes"),
      ]),
    ]);

    const result = await scanWorkspace(root.asHandle());

    expect(result.documents.map((file) => file.path)).toEqual([
      "README.md",
      "技术/EFCore.MARKDOWN",
    ]);
    expect(result.assets.map((file) => file.path)).toEqual(["技术/chart.png"]);
    expect(result.root.children.map((entry) => entry.name)).toEqual([
      "技术",
      "README.md",
    ]);
    const tech = result.root.children[0];
    expect(tech.kind).toBe("directory");
    if (tech.kind === "directory") {
      expect(tech.children.map((entry) => entry.name)).toEqual([
        "EFCore.MARKDOWN",
      ]);
    }
  });

  it("解析 Markdown 文件对应的工作空间相对资源路径", () => {
    expect(
      resolveRelativePath("技术/.NET/EFCore.md", "../images/chart%20one.png"),
    ).toBe("技术/images/chart one.png");
    expect(resolveRelativePath("README.md", "/assets/logo.webp")).toBe(
      "assets/logo.webp",
    );
    expect(resolveRelativePath("README.md", "../secret.png")).toBeNull();
    expect(resolveRelativePath("README.md", "https://example.com/a.png")).toBeNull();
    expect(() => normalizeWorkspacePath("../outside.md")).toThrowError(
      WorkspaceError,
    );
  });

  it("支持查找、创建、读写和删除 Markdown 文件", async () => {
    const root = new VirtualDirectory("Notes");
    const rootHandle = root.asHandle();

    const created = await createMarkdownFile(rootHandle, "draft", "# Draft");
    expect(created.name).toBe("draft.md");
    expect(await readTextFile(created)).toBe("# Draft");

    await writeTextFile(created, "# Updated");
    expect(await readTextFile(created)).toBe("# Updated");
    expect(await getFileHandleByRelativePath(rootHandle, "draft.md")).toBe(
      created,
    );
    expect(await findEntryByPath(rootHandle, "missing.md")).toBeNull();

    await deleteEntry(rootHandle, "draft.md");
    expect(await findEntryByPath(rootHandle, "draft.md")).toBeNull();
  });

  it("通过完整复制后删除源条目来重命名文件夹", async () => {
    const sourceFile = new VirtualFile("post.md", "# Post");
    const sourceDirectory = new VirtualDirectory("old", [sourceFile]);
    const root = new VirtualDirectory("Notes", [sourceDirectory]);
    const rootHandle = root.asHandle();

    const renamed = await renameEntry(rootHandle, "old", "new");

    expect(renamed.kind).toBe("directory");
    expect(await getDirectoryHandleByRelativePath(rootHandle, "old")).toBeNull();
    const copied = await getFileHandleByRelativePath(
      rootHandle,
      "new/post.md",
    );
    expect(copied).not.toBeNull();
    expect(await readTextFile(copied!)).toBe("# Post");
  });

  it("复制失败时保留源条目并清理不完整目标", async () => {
    const unreadable = new VirtualFile("private.md", "", { failRead: true });
    const sourceDirectory = new VirtualDirectory("old", [unreadable]);
    const root = new VirtualDirectory("Notes", [sourceDirectory]);
    const rootHandle = root.asHandle();

    await expect(renameEntry(rootHandle, "old", "new")).rejects.toMatchObject({
      code: "OPERATION_FAILED",
    });
    expect(await getDirectoryHandleByRelativePath(rootHandle, "old")).not.toBeNull();
    expect(await getDirectoryHandleByRelativePath(rootHandle, "new")).toBeNull();
  });

  it("将权限拒绝映射为可判断的业务错误", async () => {
    const root = new VirtualDirectory("Private", [], {
      permission: "denied",
    });

    await expect(scanWorkspace(root.asHandle())).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(
      toWorkspaceError(new DOMException("Denied", "NotAllowedError")),
    ).toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
