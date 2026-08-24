export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const TEXT_EXTENSIONS = [
  '.txt',
  '.log',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.less',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.py',
  '.java',
  '.cs',
  '.go',
  '.rs',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.sh',
  '.zsh',
  '.sql',
  '.ini',
  '.conf',
  '.config',
  '.env',
  '.key',
  '.webmanifest',
] as const;
export const IMAGE_EXTENSIONS = [
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
] as const;
export const AUDIO_EXTENSIONS = ['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav'] as const;
export const VIDEO_EXTENSIONS = ['.m4v', '.mov', '.mp4', '.ogv', '.webm'] as const;
export const OFFICE_EXTENSIONS = ['.csv', '.docx', '.pptx', '.xlsx'] as const;
export const PDF_EXTENSIONS = ['.pdf'] as const;
export const DRAW_EXTENSIONS = ['.excalidraw'] as const;
export const MIND_EXTENSIONS = ['.mind'] as const;
export const BOOK_EXTENSIONS = ['.azw3', '.cbz', '.epub', '.fb2', '.mobi'] as const;
export const SQLITE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3', '.db3'] as const;

export type WorkspaceEntryKind = 'directory' | 'file';
export type WorkspaceFileCategory =
  | 'markdown'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'office'
  | 'pdf'
  | 'draw'
  | 'mind'
  | 'book'
  | 'sqlite'
  | 'other';

interface WorkspaceNodeBase {
  name: string;
  /**
   * 相对于工作空间根目录的路径。根节点的路径为空字符串。
   */
  path: string;
  kind: WorkspaceEntryKind;
}

export interface WorkspaceFileNode extends WorkspaceNodeBase {
  kind: 'file';
  category: WorkspaceFileCategory;
  extension: string;
  handle: FileSystemFileHandle;
}

export interface WorkspaceDirectoryNode extends WorkspaceNodeBase {
  kind: 'directory';
  handle: FileSystemDirectoryHandle;
  children: WorkspaceNode[];
}

export type WorkspaceNode = WorkspaceDirectoryNode | WorkspaceFileNode;

export interface WorkspaceScanOptions {
  /**
   * 文档树中展示的文件扩展名。默认仅为 .md 和 .markdown。
   */
  documentExtensions?: readonly string[];
  /**
   * 扫描时额外收集的图片扩展名。
   */
  imageExtensions?: readonly string[];
  /**
   * 是否将图片也放入文档树。图片始终会出现在 assets 中。
   */
  includeImagesInTree?: boolean;
  /**
   * 是否将其他文件放入文档树，用于后续附件能力扩展。
   */
  includeOtherFiles?: boolean;
  signal?: AbortSignal;
}

export interface WorkspaceScanResult {
  root: WorkspaceDirectoryNode;
  files: WorkspaceFileNode[];
  documents: WorkspaceFileNode[];
  assets: WorkspaceFileNode[];
}

export type WorkspacePermissionMode = 'read' | 'readwrite';

export type WorkspaceErrorCode =
  | 'UNSUPPORTED'
  | 'CANCELLED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_PATH'
  | 'INVALID_FILE_TYPE'
  | 'STORAGE_UNAVAILABLE'
  | 'OPERATION_FAILED';

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(code: WorkspaceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type AutoSaveDelay = 1000 | 2000 | 5000;

/**
 * 这里只保存界面与编辑体验偏好，不允许存放文件正文、文件名或访问历史。
 */
export interface WorkspacePreferences {
  theme: ThemePreference;
  autoSaveEnabled: boolean;
  autoSaveDelay: AutoSaveDelay;
  editorFontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  previewEnabled: boolean;
  editorVisible: boolean;
  syncScroll: boolean;
  sidebarWidth: number;
  editorWidth: number;
  restoreRecentWorkspaceOnStartup: boolean;
}

export const DEFAULT_WORKSPACE_PREFERENCES: Readonly<WorkspacePreferences> = {
  theme: 'system',
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
};
