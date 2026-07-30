import {
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  WorkspaceError,
  type WorkspaceDirectoryNode,
  type WorkspaceFileCategory,
  type WorkspaceFileNode,
  type WorkspaceNode,
  type WorkspacePermissionMode,
  type WorkspaceScanOptions,
  type WorkspaceScanResult,
} from "../types/workspace";

export interface OpenDirectoryOptions {
  id?: string;
  mode?: WorkspacePermissionMode;
  startIn?: FileSystemHandle | string;
}

export interface DeleteEntryOptions {
  recursive?: boolean;
}

const DEFAULT_PICKER_ID = "meowv-markdown-workspace";

function getWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function isFileSystemAccessSupported(
  target: Window | undefined = getWindow(),
): boolean {
  return typeof target?.showDirectoryPicker === "function";
}

export function toWorkspaceError(
  error: unknown,
  fallbackMessage = "文件系统操作失败。",
): WorkspaceError {
  if (error instanceof WorkspaceError) {
    return error;
  }

  const name =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : "";

  switch (name) {
    case "AbortError":
      return new WorkspaceError("CANCELLED", "操作已取消。", { cause: error });
    case "NotAllowedError":
    case "SecurityError":
    case "NoModificationAllowedError":
      return new WorkspaceError(
        "PERMISSION_DENIED",
        "没有访问该文件或文件夹的权限。",
        { cause: error },
      );
    case "NotFoundError":
      return new WorkspaceError("NOT_FOUND", "文件或文件夹不存在。", {
        cause: error,
      });
    case "ConstraintError":
    case "PathExistsError":
      return new WorkspaceError(
        "ALREADY_EXISTS",
        "同名文件或文件夹已存在。",
        { cause: error },
      );
    case "TypeMismatchError":
      return new WorkspaceError("INVALID_PATH", "路径类型不匹配。", {
        cause: error,
      });
    default:
      return new WorkspaceError("OPERATION_FAILED", fallbackMessage, {
        cause: error,
      });
  }
}

export async function openDirectory(
  options: OpenDirectoryOptions = {},
): Promise<FileSystemDirectoryHandle> {
  const target = getWindow();
  const picker = target?.showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new WorkspaceError(
      "UNSUPPORTED",
      "当前浏览器不支持 File System Access API，请使用最新版 Chrome 或 Edge。",
    );
  }

  try {
    return await picker.call(target, {
      id: options.id ?? DEFAULT_PICKER_ID,
      mode: options.mode ?? "readwrite",
      startIn: options.startIn,
    });
  } catch (error) {
    throw toWorkspaceError(error, "无法打开本地文件夹。");
  }
}

export const openWorkspaceDirectory = openDirectory;

export async function ensurePermission(
  handle: FileSystemHandle,
  mode: WorkspacePermissionMode = "readwrite",
  requestIfNeeded = true,
): Promise<boolean> {
  if (
    typeof handle.queryPermission !== "function" ||
    typeof handle.requestPermission !== "function"
  ) {
    throw new WorkspaceError(
      "UNSUPPORTED",
      "当前浏览器无法查询本地文件访问权限。",
    );
  }

  const descriptor: FileSystemHandlePermissionDescriptor = { mode };

  try {
    const current = await handle.queryPermission(descriptor);
    if (current === "granted") {
      return true;
    }

    if (!requestIfNeeded) {
      return false;
    }

    const requested = await handle.requestPermission(descriptor);
    if (requested !== "granted") {
      throw new WorkspaceError(
        "PERMISSION_DENIED",
        mode === "readwrite"
          ? "需要文件夹读写权限才能保存更改。"
          : "需要文件夹读取权限才能打开工作空间。",
      );
    }

    return true;
  } catch (error) {
    throw toWorkspaceError(error, "无法确认本地文件访问权限。");
  }
}

export async function hasPermission(
  handle: FileSystemHandle,
  mode: WorkspacePermissionMode = "read",
): Promise<boolean> {
  return ensurePermission(handle, mode, false);
}

function normalizeExtensions(extensions: readonly string[]): Set<string> {
  return new Set(
    extensions.map((extension) => {
      const normalized = extension.trim().toLowerCase();
      return normalized.startsWith(".") ? normalized : `.${normalized}`;
    }),
  );
}

export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot < 0 ? "" : name.slice(lastDot).toLowerCase();
}

export function isMarkdownFile(name: string): boolean {
  return normalizeExtensions(MARKDOWN_EXTENSIONS).has(getFileExtension(name));
}

export function isImageFile(name: string): boolean {
  return normalizeExtensions(IMAGE_EXTENSIONS).has(getFileExtension(name));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new WorkspaceError("CANCELLED", "目录扫描已取消。", {
      cause: signal.reason,
    });
  }
}

function compareNodes(left: WorkspaceNode, right: WorkspaceNode): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

interface ScanContext {
  documentExtensions: Set<string>;
  imageExtensions: Set<string>;
  includeImagesInTree: boolean;
  includeOtherFiles: boolean;
  documents: WorkspaceFileNode[];
  assets: WorkspaceFileNode[];
  signal?: AbortSignal;
}

function categorizeFile(
  extension: string,
  context: ScanContext,
): WorkspaceFileCategory {
  if (context.documentExtensions.has(extension)) {
    return "markdown";
  }
  if (context.imageExtensions.has(extension)) {
    return "image";
  }
  return "other";
}

async function scanDirectory(
  handle: FileSystemDirectoryHandle,
  path: string,
  context: ScanContext,
): Promise<WorkspaceDirectoryNode> {
  throwIfAborted(context.signal);

  const children: WorkspaceNode[] = [];

  for await (const [name, childHandle] of handle.entries()) {
    throwIfAborted(context.signal);
    const childPath = path ? `${path}/${name}` : name;

    if (isDirectoryHandle(childHandle)) {
      children.push(await scanDirectory(childHandle, childPath, context));
      continue;
    }
    if (!isFileHandle(childHandle)) {
      continue;
    }

    const extension = getFileExtension(name);
    const category = categorizeFile(extension, context);
    const fileNode: WorkspaceFileNode = {
      kind: "file",
      name,
      path: childPath,
      extension,
      category,
      handle: childHandle,
    };

    if (category === "markdown") {
      context.documents.push(fileNode);
      children.push(fileNode);
    } else if (category === "image") {
      context.assets.push(fileNode);
      if (context.includeImagesInTree) {
        children.push(fileNode);
      }
    } else if (context.includeOtherFiles) {
      children.push(fileNode);
    }
  }

  children.sort(compareNodes);

  return {
    kind: "directory",
    name: handle.name,
    path,
    handle,
    children,
  };
}

export async function scanWorkspace(
  rootHandle: FileSystemDirectoryHandle,
  options: WorkspaceScanOptions = {},
): Promise<WorkspaceScanResult> {
  await ensurePermission(rootHandle, "read");

  const context: ScanContext = {
    documentExtensions: normalizeExtensions(
      options.documentExtensions ?? MARKDOWN_EXTENSIONS,
    ),
    imageExtensions: normalizeExtensions(
      options.imageExtensions ?? IMAGE_EXTENSIONS,
    ),
    includeImagesInTree: options.includeImagesInTree ?? false,
    includeOtherFiles: options.includeOtherFiles ?? false,
    documents: [],
    assets: [],
    signal: options.signal,
  };

  try {
    const root = await scanDirectory(rootHandle, "", context);
    context.documents.sort((left, right) =>
      left.path.localeCompare(right.path, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    context.assets.sort((left, right) =>
      left.path.localeCompare(right.path, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    return {
      root,
      documents: context.documents,
      assets: context.assets,
    };
  } catch (error) {
    throw toWorkspaceError(error, "无法读取工作空间目录。");
  }
}

export const readWorkspace = scanWorkspace;

function assertEntryName(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new WorkspaceError("INVALID_PATH", "文件或文件夹名称无效。");
  }
}

function splitWorkspacePath(path: string): string[] {
  if (path.includes("\0")) {
    throw new WorkspaceError("INVALID_PATH", "路径中包含无效字符。");
  }

  const normalized = path.replaceAll("\\", "/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        throw new WorkspaceError("INVALID_PATH", "路径不能超出工作空间。");
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments;
}

export function normalizeWorkspacePath(path: string): string {
  return splitWorkspacePath(path).join("/");
}

function stripQueryAndHash(value: string): string {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const cutAt = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), value.length);

  return value.slice(0, cutAt);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new WorkspaceError("INVALID_PATH", "资源路径编码无效。");
  }
}

/**
 * 将 Markdown 中的相对资源路径转换为工作空间根目录下的路径。
 * 外部 URL、锚点和越出根目录的路径返回 null。
 */
export function resolveRelativePath(
  fromFilePath: string,
  targetPath: string,
): string | null {
  const target = targetPath.trim();
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(target)
  ) {
    return null;
  }

  const withoutQuery = stripQueryAndHash(target);
  const decodedTarget = decodePath(
    withoutQuery.startsWith("<") && withoutQuery.endsWith(">")
      ? withoutQuery.slice(1, -1)
      : withoutQuery,
  );

  try {
    const baseSegments = decodedTarget.startsWith("/")
      ? []
      : splitWorkspacePath(fromFilePath).slice(0, -1);
    const targetSegments = decodedTarget.replace(/^\/+/, "").split("/");

    for (const segment of targetSegments) {
      if (!segment || segment === ".") {
        continue;
      }
      if (segment === "..") {
        if (baseSegments.length === 0) {
          return null;
        }
        baseSegments.pop();
      } else {
        baseSegments.push(segment);
      }
    }

    return baseSegments.join("/");
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return null;
    }
    throw error;
  }
}

async function findChildByName(
  directory: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemHandle | null> {
  for await (const [entryName, handle] of directory.entries()) {
    if (entryName === name) {
      return handle;
    }
  }
  return null;
}

function isDirectoryHandle(
  handle: FileSystemHandle,
): handle is FileSystemDirectoryHandle {
  return handle.kind === "directory";
}

function isFileHandle(
  handle: FileSystemHandle,
): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

export async function findEntryByPath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemHandle | null> {
  await ensurePermission(rootHandle, "read");

  try {
    const segments = splitWorkspacePath(relativePath);
    if (segments.length === 0) {
      return rootHandle;
    }

    let current: FileSystemHandle = rootHandle;
    for (const segment of segments) {
      if (!isDirectoryHandle(current)) {
        return null;
      }

      const next = await findChildByName(current, segment);
      if (!next) {
        return null;
      }
      current = next;
    }

    return current;
  } catch (error) {
    throw toWorkspaceError(error, "无法查找指定路径。");
  }
}

export const getEntryByRelativePath = findEntryByPath;

export async function getFileHandleByRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemFileHandle | null> {
  const handle = await findEntryByPath(rootHandle, relativePath);
  return handle && isFileHandle(handle) ? handle : null;
}

export async function getDirectoryHandleByRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle | null> {
  const handle = await findEntryByPath(rootHandle, relativePath);
  return handle && isDirectoryHandle(handle) ? handle : null;
}

export async function readFile(
  handle: FileSystemFileHandle,
): Promise<File> {
  await ensurePermission(handle, "read");

  try {
    return await handle.getFile();
  } catch (error) {
    throw toWorkspaceError(error, `无法读取文件“${handle.name}”。`);
  }
}

export async function readTextFile(
  handle: FileSystemFileHandle,
): Promise<string> {
  const file = await readFile(handle);
  try {
    return await file.text();
  } catch (error) {
    throw toWorkspaceError(error, `无法读取文件“${handle.name}”的文本内容。`);
  }
}

export const getAssetFile = readFile;

async function writeToFile(
  handle: FileSystemFileHandle,
  data: FileSystemWriteChunkType,
): Promise<void> {
  let writable: FileSystemWritableFileStream | undefined;
  let closed = false;

  try {
    writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    closed = true;
  } catch (error) {
    if (writable && !closed) {
      try {
        await writable.abort();
      } catch {
        // 原错误更能说明失败原因，忽略回滚流时的附加错误。
      }
    }
    throw toWorkspaceError(error, `无法写入文件“${handle.name}”。`);
  }
}

export async function writeTextFile(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  await ensurePermission(handle, "readwrite");
  await writeToFile(handle, content);
}

async function assertEntryDoesNotExist(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  if (await findChildByName(parent, name)) {
    throw new WorkspaceError(
      "ALREADY_EXISTS",
      `“${name}”已存在，请使用其他名称。`,
    );
  }
}

export async function createFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  content: FileSystemWriteChunkType = "",
): Promise<FileSystemFileHandle> {
  assertEntryName(name);
  await ensurePermission(parent, "readwrite");

  try {
    await assertEntryDoesNotExist(parent, name);
    const handle = await parent.getFileHandle(name, { create: true });
    try {
      await writeToFile(handle, content);
      return handle;
    } catch (error) {
      try {
        await parent.removeEntry(name);
      } catch {
        // 保留原始写入错误。
      }
      throw error;
    }
  } catch (error) {
    throw toWorkspaceError(error, `无法创建文件“${name}”。`);
  }
}

export async function createMarkdownFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  content = "",
): Promise<FileSystemFileHandle> {
  const extension = getFileExtension(name);
  const finalName = extension ? name : `${name}.md`;

  if (!isMarkdownFile(finalName)) {
    throw new WorkspaceError(
      "INVALID_FILE_TYPE",
      "Markdown 文件必须使用 .md 或 .markdown 扩展名。",
    );
  }

  return createFile(parent, finalName, content);
}

export async function createDirectory(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  assertEntryName(name);
  await ensurePermission(parent, "readwrite");

  try {
    await assertEntryDoesNotExist(parent, name);
    return await parent.getDirectoryHandle(name, { create: true });
  } catch (error) {
    throw toWorkspaceError(error, `无法创建文件夹“${name}”。`);
  }
}

export async function deleteEntry(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: DeleteEntryOptions | boolean = {},
): Promise<void> {
  assertEntryName(name);
  await ensurePermission(parent, "readwrite");

  const recursive =
    typeof options === "boolean" ? options : (options.recursive ?? false);

  try {
    if (!(await findChildByName(parent, name))) {
      throw new WorkspaceError("NOT_FOUND", `“${name}”不存在。`);
    }
    await parent.removeEntry(name, { recursive });
  } catch (error) {
    throw toWorkspaceError(error, `无法删除“${name}”。`);
  }
}

async function copyFileContents(
  source: FileSystemFileHandle,
  destination: FileSystemFileHandle,
): Promise<void> {
  const file = await source.getFile();
  await writeToFile(destination, file);
}

async function copyDirectoryContents(
  source: FileSystemDirectoryHandle,
  destination: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, child] of source.entries()) {
    if (isDirectoryHandle(child)) {
      const childDestination = await destination.getDirectoryHandle(name, {
        create: true,
      });
      await copyDirectoryContents(child, childDestination);
    } else {
      const childDestination = await destination.getFileHandle(name, {
        create: true,
      });
      await copyFileContents(child as FileSystemFileHandle, childDestination);
    }
  }
}

/**
 * File System Access API 没有通用的原子移动操作；先完整复制，确认成功后再删除源条目。
 */
async function relocateEntry(
  sourceParent: FileSystemDirectoryHandle,
  sourceName: string,
  destinationParent: FileSystemDirectoryHandle,
  destinationName: string,
): Promise<FileSystemHandle> {
  assertEntryName(sourceName);
  assertEntryName(destinationName);
  await ensurePermission(sourceParent, "readwrite");
  await ensurePermission(destinationParent, "readwrite");

  let destinationCreated = false;

  try {
    const source = await findChildByName(sourceParent, sourceName);
    if (!source) {
      throw new WorkspaceError("NOT_FOUND", `“${sourceName}”不存在。`);
    }

    await assertEntryDoesNotExist(destinationParent, destinationName);

    let destination: FileSystemHandle;
    if (isDirectoryHandle(source)) {
      const directory = await destinationParent.getDirectoryHandle(
        destinationName,
        { create: true },
      );
      destination = directory;
      destinationCreated = true;
      await copyDirectoryContents(source, directory);
    } else {
      const file = await destinationParent.getFileHandle(destinationName, {
        create: true,
      });
      destination = file;
      destinationCreated = true;
      await copyFileContents(source as FileSystemFileHandle, file);
    }

    try {
      await sourceParent.removeEntry(sourceName, {
        recursive: source.kind === "directory",
      });
    } catch (error) {
      try {
        await destinationParent.removeEntry(destinationName, {
          recursive: destination.kind === "directory",
        });
        destinationCreated = false;
      } catch {
        throw new WorkspaceError(
          "OPERATION_FAILED",
          `“${sourceName}”未能删除，且复制出的“${destinationName}”需要手动清理。`,
          { cause: error },
        );
      }
      throw error;
    }

    return destination;
  } catch (error) {
    if (destinationCreated) {
      try {
        await destinationParent.removeEntry(destinationName, {
          recursive: true,
        });
      } catch {
        // 若清理也失败，外层错误仍会提示重命名未完成。
      }
    }
    throw error;
  }
}

/**
 * File System Access API 尚无通用 rename；先完整复制，确认成功后再删除源条目。
 */
export async function renameEntry(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<FileSystemHandle> {
  assertEntryName(oldName);
  assertEntryName(newName);

  if (oldName === newName) {
    const unchanged = await findChildByName(parent, oldName);
    if (!unchanged) {
      throw new WorkspaceError("NOT_FOUND", `“${oldName}”不存在。`);
    }
    return unchanged;
  }

  try {
    return await relocateEntry(parent, oldName, parent, newName);
  } catch (error) {
    throw toWorkspaceError(error, `无法将“${oldName}”重命名为“${newName}”。`);
  }
}

/**
 * 将条目移动到另一个已授权的文件夹。调用方需阻止文件夹移动到自身或其子文件夹。
 */
export async function moveEntry(
  sourceParent: FileSystemDirectoryHandle,
  sourceName: string,
  destinationParent: FileSystemDirectoryHandle,
): Promise<FileSystemHandle> {
  try {
    return await relocateEntry(
      sourceParent,
      sourceName,
      destinationParent,
      sourceName,
    );
  } catch (error) {
    throw toWorkspaceError(error, `无法移动“${sourceName}”。`);
  }
}
