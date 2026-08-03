import { computed, markRaw, ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { useTheme } from '@/composables/useTheme';
import {
  DEMO_ASSETS,
  DEMO_DOCUMENTS,
  DEMO_TREE,
  DEMO_WORKSPACE_NAME,
  type DemoTreeNode,
} from '@/features/markdown/demo/workspace';
import {
  createDirectory,
  createFile,
  createMarkdownFile,
  deleteEntry,
  ensurePermission,
  getDirectoryHandleByRelativePath,
  getFileHandleByRelativePath,
  isFileSystemAccessSupported,
  moveEntry,
  openDirectory,
  readFile,
  readTextFile,
  renameEntry,
  scanWorkspace,
  toWorkspaceError,
  writeTextFile,
} from '@/features/markdown/services/file-system';
import {
  buildBacklinks,
  buildKnowledgeGraph,
  countTags,
  documentKnowledgeId,
  resolveWikiLink,
  type Backlink,
  type KnowledgeDocument,
} from '@/features/markdown/services/knowledge';
import {
  parseMarkdownDocument,
  resolveRelativeAssetPath,
  type ParsedMarkdownDocument,
} from '@/features/markdown/services/markdown';
import {
  createSearchController,
  type MarkdownSearchResult,
  type SearchDocument,
} from '@/features/markdown/services/search';
import {
  clearRecentDirectory,
  getPreferences,
  getLastActiveDocumentPath,
  getRecentDirectory,
  getWorkspaceHistory,
  isDocumentLocked,
  removeWorkspaceHistory,
  savePreferences,
  saveLastActiveDocumentPath,
  saveRecentDirectory,
  saveWorkspaceHistory,
  setDocumentLocked,
  type WorkspaceHistoryEntry,
} from '@/features/markdown/services/storage';
import {
  downloadDocx,
  downloadHtml,
  downloadImage,
  downloadMarkdown,
  downloadPdf,
  type ExportExtension,
} from '@/features/markdown/services/export';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  WorkspaceError,
  type WorkspaceFileNode,
  type WorkspaceFileCategory,
  type WorkspaceNode,
  type WorkspacePreferences,
} from '@/features/markdown/types/workspace';

export type WorkspacePanel = 'explorer' | 'search' | 'tags' | 'assets' | 'graph';
export type MobileWorkspaceView = 'editor' | 'preview';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type ToastKind = 'success' | 'error' | 'info';
export type FullscreenPane = 'editor' | 'preview' | 'workspace' | null;
export type LayoutWidthKey = 'sidebarWidth' | 'editorWidth';

export interface DisplayTreeNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  category?: WorkspaceFileCategory;
  extension?: string;
  children?: DisplayTreeNode[];
  handle?: FileSystemHandle;
}

export interface LoadedDocument {
  path: string;
  name: string;
  content: string;
  parsed: ParsedMarkdownDocument;
  category?: 'markdown' | 'text';
  handle?: FileSystemFileHandle;
}

export interface WorkspaceAsset {
  name: string;
  path: string;
  url?: string;
  handle?: FileSystemFileHandle;
}

export interface AppToast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: {
    label: string;
    run: () => void;
  };
}

interface WorkspaceMove {
  id: number;
  name: string;
  kind: DisplayTreeNode['kind'];
  sourceParentPath: string;
  destinationParentPath: string;
}

const DEFAULT_DEMO_PATH = '技术/.NET/EFCore性能优化.md';
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const EMPTY_PARSED = parseMarkdownDocument('');
const searchController = markRaw(createSearchController());
const MINIMUM_REFRESH_INDICATOR_DURATION = 1000;
const PREVIEW_REFRESH_DELAY = 160;
const LARGE_DOCUMENT_PREVIEW_REFRESH_DELAY = 360;
const LARGE_DOCUMENT_THRESHOLD = 250_000;
const DOCUMENT_INDEX_BATCH_SIZE = 4;
const DOCUMENT_INDEX_PUBLISH_INTERVAL = 32;

function yieldDocumentIndexFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 16);
  });
}

function cloneDisplayTree(node: WorkspaceNode | DemoTreeNode): DisplayTreeNode {
  if (node.kind === 'file') {
    return {
      kind: 'file',
      name: node.name,
      path: node.path,
      category: 'category' in node ? node.category : 'markdown',
      ...('extension' in node ? { extension: node.extension } : {}),
      ...('handle' in node ? { handle: markRaw(node.handle) } : {}),
    };
  }

  return {
    kind: 'directory',
    name: node.name,
    path: node.path,
    children: (node.children ?? []).map(cloneDisplayTree),
    ...('handle' in node ? { handle: markRaw(node.handle) } : {}),
  };
}

function fileNameFromPath(path: string): string {
  return path.split('/').pop() || path;
}

function directoryPath(path: string): string {
  const segments = path.split('/');
  segments.pop();
  return segments.join('/');
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

function normalizeMarkdownName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  return /\.(?:md|markdown)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function safeAssetName(name: string): string {
  const normalized = name
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '');
  return normalized || `image-${Date.now()}.png`;
}

function relativePathBetween(fromFilePath: string, targetPath: string): string {
  const from = directoryPath(fromFilePath).split('/').filter(Boolean);
  const target = targetPath.split('/').filter(Boolean);
  let common = 0;

  while (common < from.length && common < target.length && from[common] === target[common]) {
    common += 1;
  }

  const upward = Array.from({ length: from.length - common }, () => '..');
  const downward = target.slice(common);
  const joined = [...upward, ...downward].join('/');
  return joined || fileNameFromPath(targetPath);
}

function createSearchDocument(
  document: Pick<LoadedDocument, 'path' | 'content' | 'parsed'>,
): SearchDocument {
  return {
    id: document.path,
    path: document.path,
    title: document.parsed.metadata.title,
    content: document.content,
    tags: document.parsed.metadata.tags,
  };
}

function createKnowledgeDocument(document: LoadedDocument): KnowledgeDocument {
  return {
    id: document.path,
    path: document.path,
    title: document.parsed.metadata.title,
    content: document.content,
    tags: document.parsed.metadata.tags,
    category: document.parsed.metadata.category,
    wikiLinks: document.parsed.wikiLinks,
  };
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export const useWorkspaceStore = defineStore('studio-markdown-workspace', () => {
  const { resolved: resolvedTheme } = useTheme();
  const initialized = ref(false);
  const busy = ref(false);
  const refreshing = ref(false);
  const indexing = ref(false);
  const isDemo = ref(false);
  const isStandaloneFile = ref(false);
  const workspaceName = ref('');
  const rootHandle = shallowRef<FileSystemDirectoryHandle | null>(null);
  const workspaceHistoryId = ref('');
  const recentDirectory = shallowRef<FileSystemDirectoryHandle | null>(null);
  const workspaceHistory = ref<WorkspaceHistoryEntry[]>([]);
  const treeRoot = shallowRef<DisplayTreeNode | null>(null);
  const documentNodes = shallowRef<WorkspaceFileNode[]>([]);
  const fileNodes = shallowRef<WorkspaceFileNode[]>([]);
  const documents = shallowRef(new Map<string, LoadedDocument>());
  const activeLoadedDocument = shallowRef<LoadedDocument | null>(null);
  const assets = ref<WorkspaceAsset[]>([]);
  const assetUrls = ref<Record<string, string>>({});
  const activePath = ref('');
  const untitledDraft = ref(false);
  const draftSaveRequested = ref(false);
  const lockedDocumentPaths = ref<ReadonlySet<string>>(new Set());
  const activeContent = ref('');
  const previewContent = ref('');
  const lastSavedContent = ref('');
  const saveState = ref<SaveState>('idle');
  const lastSavedAt = ref<Date | null>(null);
  const activePanel = ref<WorkspacePanel>('explorer');
  const sidebarOpen = ref(true);
  const mobileView = ref<MobileWorkspaceView>('editor');
  const fullscreenPane = ref<FullscreenPane>(null);
  const searchQuery = ref('');
  const searchResults = ref<MarkdownSearchResult[]>([]);
  const selectedTag = ref('');
  const preferences = ref<WorkspacePreferences>({
    ...DEFAULT_WORKSPACE_PREFERENCES,
  });
  const cursorLine = ref(1);
  const cursorColumn = ref(1);
  const toasts = ref<AppToast[]>([]);
  const lastMove = shallowRef<WorkspaceMove | null>(null);
  let toastSequence = 0;
  let moveSequence = 0;
  let moveInProgress = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let savePromise: Promise<boolean> | null = null;
  let workspaceOperationSequence = 0;
  let documentOpenSequence = 0;
  let activeContentRevision = 0;
  let assetResolveSequence = 0;
  let activeAssetDocumentPath = '';
  let activeObjectUrls = new Map<string, string>();
  let assetPreviewObjectUrls: string[] = [];

  const hasWorkspace = computed(() => treeRoot.value !== null);
  const hasEditableDocument = computed(() => Boolean(activePath.value) || untitledDraft.value);
  const fileSystemSupported = computed(() => isFileSystemAccessSupported());
  const canUndoMove = computed(() => lastMove.value !== null);
  const activeDocument = computed(() => activeLoadedDocument.value);
  const isPlainTextDocument = computed(() => activeLoadedDocument.value?.category === 'text');
  const activeName = computed(() => {
    if (activePath.value) {
      return fileNameFromPath(activePath.value);
    }
    return untitledDraft.value ? '未命名文档' : '';
  });
  const isActiveDocumentLocked = computed(() => lockedDocumentPaths.value.has(activePath.value));
  const parsedDocument = computed(() => {
    if (!hasEditableDocument.value) {
      return EMPTY_PARSED;
    }

    return parseMarkdownDocument(previewContent.value, {
      path: activePath.value,
      imageResolver: ({ resolvedPath }) =>
        resolvedPath ? assetUrls.value[resolvedPath] : undefined,
    });
  });
  const previewHtml = computed(() => enforceSafeImages(parsedDocument.value.html));
  const allKnowledgeDocuments = computed(() =>
    [...documents.value.values()].map(createKnowledgeDocument),
  );
  const tagCounts = computed(() => countTags(allKnowledgeDocuments.value));
  const backlinksIndex = computed(() => buildBacklinks(allKnowledgeDocuments.value));
  const activeBacklinks = computed<Backlink[]>(() => {
    const document = activeDocument.value;
    if (!document) {
      return [];
    }
    return backlinksIndex.value[documentKnowledgeId(createKnowledgeDocument(document))] ?? [];
  });
  const knowledgeGraph = computed(() =>
    buildKnowledgeGraph(allKnowledgeDocuments.value, {
      includeTags: true,
      includeCategories: true,
      includeUnresolved: true,
    }),
  );
  const selectedTagDocuments = computed(() => {
    const selected = selectedTag.value.trim().toLocaleLowerCase();
    if (!selected) {
      return [];
    }
    return [...documents.value.values()].filter((document) =>
      document.parsed.metadata.tags.some((tag) => tag.toLocaleLowerCase() === selected),
    );
  });

  function setDocumentLockState(path: string, locked: boolean): void {
    const next = new Set(lockedDocumentPaths.value);
    if (locked) {
      next.add(path);
    } else {
      next.delete(path);
    }
    lockedDocumentPaths.value = next;
  }

  function enforceSafeImages(html: string): string {
    if (typeof DOMParser === 'undefined') {
      return html;
    }

    const parsed = new DOMParser().parseFromString(
      `<main data-preview-root>${html}</main>`,
      'text/html',
    );
    const root = parsed.querySelector<HTMLElement>('[data-preview-root]');
    if (!root) {
      return html;
    }

    for (const element of root.querySelectorAll('[srcset]')) {
      element.removeAttribute('srcset');
    }

    for (const media of root.querySelectorAll('video, audio, source')) {
      const replacement = parsed.createElement('span');
      replacement.className = 'remote-image-blocked';
      replacement.textContent = '已阻止 Markdown 中的媒体资源';
      media.replaceWith(replacement);
    }

    for (const image of root.querySelectorAll('img')) {
      const source = image.getAttribute('src')?.trim() ?? '';
      const isLocal =
        source.startsWith('blob:') ||
        /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(source) ||
        (isDemo.value && source.startsWith('/markdown-assets/demo/'));
      const isRemote = source.startsWith('https://');

      if (isLocal || isRemote) {
        image.removeAttribute('srcset');
        image.setAttribute('loading', 'lazy');
        image.setAttribute('decoding', 'async');
        continue;
      }

      const replacement = parsed.createElement('span');
      replacement.className = 'remote-image-blocked';
      replacement.textContent = image.getAttribute('alt')
        ? `图片来源不受支持：${image.getAttribute('alt')}`
        : '图片来源不受支持';
      image.replaceWith(replacement);
    }

    return root.innerHTML;
  }

  function notify(
    kind: ToastKind,
    title: string,
    message?: string,
    action?: AppToast['action'],
  ): void {
    toastSequence += 1;
    const toast: AppToast = {
      id: toastSequence,
      kind,
      title,
      ...(message ? { message } : {}),
      ...(action ? { action } : {}),
    };
    toasts.value = [...toasts.value, toast];
    globalThis.setTimeout(() => dismissToast(toast.id), 4200);
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  async function initialize(): Promise<void> {
    if (initialized.value) {
      return;
    }
    initialized.value = true;
    try {
      preferences.value = await getPreferences();
    } catch {
      preferences.value = { ...DEFAULT_WORKSPACE_PREFERENCES };
    }

    try {
      recentDirectory.value = await getRecentDirectory();
    } catch {
      recentDirectory.value = null;
    }

    try {
      workspaceHistory.value = await getWorkspaceHistory();
    } catch {
      workspaceHistory.value = [];
    }

    if (recentDirectory.value && workspaceHistory.value.length === 0) {
      try {
        workspaceHistory.value = await saveWorkspaceHistory(recentDirectory.value);
      } catch {
        // 历史记录不可用时，仍保留原有的最近工作空间入口。
      }
    }

    const query = new URLSearchParams(globalThis.location?.search ?? '');
    if (query.get('demo') === '1') {
      await loadDemoWorkspace();
      return;
    }

    const restored =
      recentDirectory.value && preferences.value.restoreRecentWorkspaceOnStartup
        ? await openWorkspaceHandle(recentDirectory.value, workspaceHistory.value[0], {
            requestPermission: false,
            notifyError: false,
            restoreAutoOpen: false,
          })
        : false;

    if (!restored) {
      await loadDemoWorkspace();
    }
  }

  async function updatePreferences(values: Partial<WorkspacePreferences>): Promise<void> {
    const nextPreferences = { ...preferences.value, ...values };
    if (!nextPreferences.previewEnabled && !nextPreferences.editorVisible) {
      nextPreferences.editorVisible = true;
    }
    preferences.value = nextPreferences;
    try {
      preferences.value = await savePreferences(preferences.value);
    } catch (error) {
      notify('error', '设置未能保存', toMessage(error));
    }
  }

  function setLayoutWidth(key: LayoutWidthKey, width: number): void {
    const bounds =
      key === 'sidebarWidth' ? { minimum: 116, maximum: 600 } : { minimum: 360, maximum: 1200 };
    preferences.value = {
      ...preferences.value,
      [key]: Math.min(bounds.maximum, Math.max(bounds.minimum, Math.round(width))),
    };
  }

  async function persistLayoutWidths(): Promise<void> {
    try {
      preferences.value = await savePreferences(preferences.value);
    } catch (error) {
      notify('error', '布局未能保存', toMessage(error));
    }
  }

  function toggleFullscreen(pane: Exclude<FullscreenPane, null>): void {
    fullscreenPane.value = fullscreenPane.value === pane ? null : pane;
  }

  async function toggleEditorVisibility(): Promise<void> {
    await updatePreferences({
      editorVisible: !preferences.value.editorVisible,
      previewEnabled: true,
    });
  }

  async function setRestoreRecentWorkspaceOnStartup(value: boolean): Promise<void> {
    if (preferences.value.restoreRecentWorkspaceOnStartup === value) {
      return;
    }
    preferences.value = {
      ...preferences.value,
      restoreRecentWorkspaceOnStartup: value,
    };
    try {
      preferences.value = await savePreferences(preferences.value);
    } catch (error) {
      notify('error', '设置未能保存', toMessage(error));
    }
  }

  async function toggleActiveDocumentLock(): Promise<void> {
    const path = activePath.value;
    if (!path) {
      return;
    }
    if (isActiveDocumentLocked.value) {
      try {
        await setDocumentLocked(workspaceName.value, path, false);
        setDocumentLockState(path, false);
        notify('success', '文档已解锁', '现在可以继续编辑当前文档。');
      } catch (error) {
        notify('error', '无法解锁文档', toMessage(error));
      }
      return;
    }
    if (!(await saveActiveDocument()) || activePath.value !== path) {
      return;
    }
    try {
      if (!isPlainTextDocument.value && !preferences.value.previewEnabled) {
        await updatePreferences({ previewEnabled: true });
      }
      await setDocumentLocked(workspaceName.value, path, true);
      setDocumentLockState(path, true);
      notify('success', '文档已锁定', '当前文档已切换为只读。');
    } catch (error) {
      notify('error', '无法锁定文档', toMessage(error));
    }
  }

  async function openLocalWorkspace(): Promise<void> {
    busy.value = true;
    try {
      const handle = await openDirectory({ mode: 'readwrite' });
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return;
      }
      await loadRealWorkspace(handle);
      const historyId = await rememberWorkspace(handle);
      workspaceHistoryId.value = historyId;
      if (historyId && activePath.value) {
        void saveLastActiveDocumentPath(historyId, activePath.value).catch(() => undefined);
      }
      await setRestoreRecentWorkspaceOnStartup(true);
    } catch (error) {
      const normalized = toWorkspaceError(error);
      if (normalized.code !== 'CANCELLED') {
        notify('error', '无法打开工作空间', normalized.message);
      }
    } finally {
      busy.value = false;
    }
  }

  async function reopenRecentWorkspace(): Promise<void> {
    const handle = recentDirectory.value;
    if (!handle) {
      return;
    }

    await openWorkspaceHandle(handle, workspaceHistory.value[0]);
  }

  async function openWorkspaceHistory(id: string): Promise<void> {
    const entry = workspaceHistory.value.find((item) => item.id === id);
    if (!entry) {
      return;
    }

    await openWorkspaceHandle(entry.handle, entry);
  }

  async function openWorkspaceHandle(
    handle: FileSystemDirectoryHandle,
    historyEntry?: WorkspaceHistoryEntry,
    options: {
      requestPermission?: boolean;
      notifyError?: boolean;
      restoreAutoOpen?: boolean;
    } = {},
  ): Promise<boolean> {
    busy.value = true;
    try {
      const permitted = await ensurePermission(
        handle,
        'readwrite',
        options.requestPermission ?? true,
      );
      if (!permitted) {
        return false;
      }
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return false;
      }
      await loadRealWorkspace(handle, historyEntry?.id ?? '');
      const historyId = await rememberWorkspace(handle);
      workspaceHistoryId.value = historyId;
      if (historyId && activePath.value) {
        void saveLastActiveDocumentPath(historyId, activePath.value).catch(() => undefined);
      }
      if (options.restoreAutoOpen ?? true) {
        await setRestoreRecentWorkspaceOnStartup(true);
      }
      return true;
    } catch (error) {
      const normalized = toWorkspaceError(error);
      if (normalized.code === 'NOT_FOUND' && historyEntry) {
        await forgetUnavailableWorkspaceHistory(historyEntry);
        if (options.notifyError ?? true) {
          notify(
            'error',
            '工作空间已不存在',
            `“${historyEntry.name}”已从历史记录移除，当前工作空间未切换。`,
          );
        }
      } else if (options.notifyError ?? true) {
        notify('error', '无法切换工作空间', normalized.message);
      }
      return false;
    } finally {
      busy.value = false;
    }
  }

  async function rememberWorkspace(handle: FileSystemDirectoryHandle): Promise<string> {
    recentDirectory.value = handle;
    let storageError: unknown;
    let historyId = '';

    try {
      await saveRecentDirectory(handle);
    } catch (error) {
      storageError = error;
    }

    try {
      workspaceHistory.value = await saveWorkspaceHistory(handle);
      historyId = workspaceHistory.value[0]?.id ?? '';
    } catch (error) {
      storageError ??= error;
    }

    if (storageError) {
      notify('info', '工作空间已打开', '历史记录未能保存到浏览器本地存储。');
    }
    return historyId;
  }

  async function forgetUnavailableWorkspaceHistory(entry: WorkspaceHistoryEntry): Promise<void> {
    const wasRecent = workspaceHistory.value[0]?.id === entry.id;

    try {
      workspaceHistory.value = await removeWorkspaceHistory(entry.id);
    } catch {
      workspaceHistory.value = workspaceHistory.value.filter((item) => item.id !== entry.id);
    }

    if (!wasRecent) {
      return;
    }

    recentDirectory.value = null;
    try {
      await clearRecentDirectory();
    } catch {
      // 当前页面不再展示失效入口；下次启动时会重新读取浏览器存储。
    }
  }

  async function loadRealWorkspace(
    handle: FileSystemDirectoryHandle,
    historyId = '',
  ): Promise<void> {
    const operation = ++workspaceOperationSequence;
    documentOpenSequence += 1;
    indexing.value = false;
    const result = await scanWorkspace(handle, {
      includeImagesInTree: true,
      includeOtherFiles: true,
    });
    if (operation !== workspaceOperationSequence) {
      return;
    }

    searchResults.value = [];
    await searchController.clear();
    if (operation !== workspaceOperationSequence) {
      return;
    }
    releaseAllObjectUrls();
    lastMove.value = null;
    rootHandle.value = markRaw(handle);
    workspaceHistoryId.value = historyId;
    isDemo.value = false;
    isStandaloneFile.value = false;
    workspaceName.value = handle.name;
    treeRoot.value = markRaw(cloneDisplayTree(result.root));
    documentNodes.value = result.documents.map((node) => markRaw(node));
    fileNodes.value = result.files.map((node) => markRaw(node));
    assets.value = result.assets.map((node) => ({
      name: node.name,
      path: node.path,
      handle: markRaw(node.handle),
    }));
    documents.value = new Map();
    activeLoadedDocument.value = null;
    lockedDocumentPaths.value = new Set();
    activePath.value = '';
    untitledDraft.value = false;
    draftSaveRequested.value = false;
    activeContent.value = '';
    previewContent.value = '';
    lastSavedContent.value = '';
    saveState.value = 'idle';
    let lastActivePath: string | null = null;
    if (historyId) {
      try {
        lastActivePath = await getLastActiveDocumentPath(historyId);
      } catch {
        // 恢复记录不可用时，仍按默认规则打开文档。
      }
    }
    const firstDocument =
      (lastActivePath
        ? result.files.find(
            (file) =>
              file.path === lastActivePath &&
              (file.category === 'markdown' || file.category === 'text'),
          )
        : undefined) ??
      result.documents.find((document) => /readme\.md$/i.test(document.path)) ??
      result.documents[0] ??
      result.files.find((file) => file.category === 'text');
    if (firstDocument) {
      await openDocument(firstDocument.path);
      if (operation !== workspaceOperationSequence) {
        return;
      }
      const openedDocument = documents.value.get(firstDocument.path);
      if (openedDocument) {
        await searchController.replaceAll([createSearchDocument(openedDocument)]);
      }
    } else {
      startUntitledDraft();
    }
    void hydrateDocumentIndex(result.documents, operation, {
      preservePublishedDocuments: true,
      seedDocuments: new Map(documents.value),
    }).catch((error) => {
      if (operation === workspaceOperationSequence) {
        notify('error', '后台索引失败', toMessage(error));
      }
    });
  }

  function startUntitledDraft(): void {
    activePath.value = '';
    activeLoadedDocument.value = null;
    untitledDraft.value = true;
    draftSaveRequested.value = false;
    lockedDocumentPaths.value = new Set();
    activeContent.value = '';
    previewContent.value = '';
    lastSavedContent.value = '';
    lastSavedAt.value = null;
    saveState.value = 'idle';
    cursorLine.value = 1;
    cursorColumn.value = 1;
    activeContentRevision += 1;
  }

  async function loadStandaloneFile(file: File): Promise<void> {
    busy.value = true;
    const operation = ++workspaceOperationSequence;
    documentOpenSequence += 1;
    try {
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return;
      }
      if (operation !== workspaceOperationSequence) {
        return;
      }

      const content = await file.text();
      const path = normalizeMarkdownName(file.name) || 'document.md';
      const document: LoadedDocument = {
        path,
        name: path,
        content,
        parsed: parseMarkdownDocument(content, { path }),
      };

      releaseAllObjectUrls();
      rootHandle.value = null;
      workspaceHistoryId.value = '';
      isDemo.value = true;
      isStandaloneFile.value = true;
      workspaceName.value = file.name;
      treeRoot.value = markRaw({
        kind: 'directory',
        name: '本地单文件',
        path: '',
        children: [{ kind: 'file', name: path, path, category: 'markdown' }],
      } satisfies DisplayTreeNode);
      documentNodes.value = [];
      fileNodes.value = [];
      documents.value = new Map([[path, document]]);
      activeLoadedDocument.value = document;
      assets.value = [];
      activePath.value = path;
      untitledDraft.value = false;
      draftSaveRequested.value = false;
      activeContent.value = content;
      previewContent.value = content;
      lastSavedContent.value = content;
      lastSavedAt.value = new Date(file.lastModified || Date.now());
      saveState.value = 'saved';
      lockedDocumentPaths.value = new Set();
      searchResults.value = [];
      await searchController.replaceAll([createSearchDocument(document)]);
      notify('success', 'Markdown 文件已打开', '保存时会下载更新后的本地副本。');
    } catch (error) {
      notify('error', '无法打开 Markdown 文件', toMessage(error));
    } finally {
      busy.value = false;
    }
  }

  async function loadDemoWorkspace(): Promise<void> {
    busy.value = true;
    const operation = ++workspaceOperationSequence;
    documentOpenSequence += 1;
    indexing.value = false;
    try {
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return;
      }
      if (operation !== workspaceOperationSequence) {
        return;
      }
      releaseAllObjectUrls();
      lastMove.value = null;
      rootHandle.value = null;
      workspaceHistoryId.value = '';
      isDemo.value = true;
      isStandaloneFile.value = false;
      workspaceName.value = DEMO_WORKSPACE_NAME;
      treeRoot.value = markRaw(cloneDisplayTree(DEMO_TREE));
      documentNodes.value = [];
      fileNodes.value = [];
      assets.value = DEMO_ASSETS.map((asset) => ({ ...asset }));
      searchResults.value = [];
      await searchController.clear();
      if (operation !== workspaceOperationSequence) {
        return;
      }
      activePath.value = '';
      untitledDraft.value = false;
      draftSaveRequested.value = false;
      activeContent.value = '';
      previewContent.value = '';
      lastSavedContent.value = '';
      saveState.value = 'idle';
      const loaded = new Map<string, LoadedDocument>();

      for (const document of DEMO_DOCUMENTS) {
        loaded.set(document.path, {
          path: document.path,
          name: fileNameFromPath(document.path),
          content: document.content,
          parsed: parseMarkdownDocument(document.content, {
            path: document.path,
            imageResolver: ({ resolvedPath }) =>
              resolvedPath
                ? DEMO_ASSETS.find((asset) => asset.path === resolvedPath)?.url
                : undefined,
          }),
        });
      }
      documents.value = loaded;
      activeLoadedDocument.value = null;
      assetUrls.value = Object.fromEntries(DEMO_ASSETS.map((asset) => [asset.path, asset.url]));
      lockedDocumentPaths.value = new Set();
      await searchController.replaceAll([...loaded.values()].map(createSearchDocument));
      if (operation !== workspaceOperationSequence) {
        return;
      }
      await openDocument(DEFAULT_DEMO_PATH);
      notify('info', '示例工作空间已打开', '示例编辑只保留在当前页面，不会写入你的文件。');
    } finally {
      busy.value = false;
    }
  }

  async function hydrateDocumentIndex(
    nodes: readonly WorkspaceFileNode[],
    operation = workspaceOperationSequence,
    options: {
      publishDocuments?: boolean;
      preservePublishedDocuments?: boolean;
      seedDocuments?: ReadonlyMap<string, LoadedDocument>;
      updateSearch?: boolean;
    } = {},
  ): Promise<Map<string, LoadedDocument>> {
    indexing.value = true;
    const loaded = new Map(
      options.seedDocuments ?? (options.publishDocuments === false ? [] : documents.value),
    );
    const publishDocuments = options.publishDocuments !== false;
    const updateSearch = options.updateSearch !== false;

    const publishProgress = (): void => {
      if (!publishDocuments) {
        return;
      }
      if (options.preservePublishedDocuments) {
        const currentDocuments = documents.value;
        for (const [path, document] of currentDocuments) {
          if (loaded.has(path)) {
            loaded.set(path, document);
          }
        }
      }
      documents.value = new Map(loaded);
    };

    try {
      for (let offset = 0; offset < nodes.length; offset += DOCUMENT_INDEX_BATCH_SIZE) {
        if (operation !== workspaceOperationSequence) {
          return loaded;
        }
        const batch = nodes.slice(offset, offset + DOCUMENT_INDEX_BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (node) => {
            try {
              const content = await readTextFile(node.handle);
              return {
                path: node.path,
                name: node.name,
                content,
                parsed: parseMarkdownDocument(content, { path: node.path }),
                handle: markRaw(node.handle),
              } satisfies LoadedDocument;
            } catch {
              return null;
            }
          }),
        );

        if (operation !== workspaceOperationSequence) {
          return loaded;
        }
        for (const document of results) {
          if (document && !loaded.has(document.path)) {
            loaded.set(document.path, document);
          }
        }
        if (updateSearch) {
          const updates: Promise<void>[] = [];
          for (const document of results) {
            if (document) {
              updates.push(searchController.upsert(createSearchDocument(document)));
            }
          }
          await Promise.all(updates);
        }
        const indexedCount = offset + batch.length;
        if (indexedCount === nodes.length || indexedCount % DOCUMENT_INDEX_PUBLISH_INTERVAL === 0) {
          publishProgress();
        }
        await yieldDocumentIndexFrame();
      }

      publishProgress();
      return loaded;
    } finally {
      if (operation === workspaceOperationSequence) {
        indexing.value = false;
      }
    }
  }

  async function openDocument(path: string): Promise<void> {
    if (!path || path === activePath.value) {
      return;
    }

    const workspaceOperation = workspaceOperationSequence;
    const openOperation = ++documentOpenSequence;
    if (hasEditableDocument.value && !(await saveActiveDocument())) {
      return;
    }
    if (
      workspaceOperation !== workspaceOperationSequence ||
      openOperation !== documentOpenSequence
    ) {
      return;
    }

    const fileNode = fileNodes.value.find((item) => item.path === path);
    if (fileNode && fileNode.category !== 'markdown' && fileNode.category !== 'text') {
      return;
    }

    let document = documents.value.get(path);
    if (!document && rootHandle.value) {
      try {
        const node = fileNode ?? documentNodes.value.find((item) => item.path === path);
        const handle = node?.handle ?? (await getFileHandleByRelativePath(rootHandle.value, path));
        if (
          workspaceOperation !== workspaceOperationSequence ||
          openOperation !== documentOpenSequence
        ) {
          return;
        }
        if (!handle) {
          notify('error', '文件不存在', path);
          return;
        }
        const content = await readTextFile(handle);
        if (
          workspaceOperation !== workspaceOperationSequence ||
          openOperation !== documentOpenSequence
        ) {
          return;
        }
        document = {
          path,
          name: fileNameFromPath(path),
          content,
          parsed: parseMarkdownDocument(content, { path }),
          category: node?.category === 'text' ? 'text' : 'markdown',
          handle: markRaw(handle),
        };
        if (document.category !== 'text') {
          documents.value = new Map(documents.value).set(path, document);
        }
      } catch (error) {
        notify('error', '无法打开文件', `${path}：${toMessage(error)}`);
        return;
      }
    }

    if (!document) {
      return;
    }

    let documentLocked = false;
    try {
      documentLocked = await isDocumentLocked(workspaceName.value, path);
    } catch {
      // 本地锁定状态不可用时，仍允许正常打开文档。
    }
    if (
      workspaceOperation !== workspaceOperationSequence ||
      openOperation !== documentOpenSequence
    ) {
      return;
    }

    activePath.value = path;
    activeLoadedDocument.value = document;
    if (!isDemo.value && workspaceHistoryId.value) {
      void saveLastActiveDocumentPath(workspaceHistoryId.value, path).catch(() => undefined);
    }
    untitledDraft.value = false;
    draftSaveRequested.value = false;
    setDocumentLockState(path, documentLocked);
    activeContent.value = document.content;
    previewContent.value = document.content;
    lastSavedContent.value = document.content;
    activeContentRevision += 1;
    saveState.value = 'saved';
    cursorLine.value = 1;
    cursorColumn.value = 1;
    if (document.category === 'text') {
      releaseActiveObjectUrls();
      assetUrls.value = {};
    } else {
      await resolveActiveAssets();
    }
    if (globalThis.innerWidth <= 980) {
      sidebarOpen.value = false;
    }
  }

  function updateContent(content: string): void {
    if (
      !hasEditableDocument.value ||
      isActiveDocumentLocked.value ||
      content === activeContent.value
    ) {
      return;
    }
    activeContent.value = content;
    activeContentRevision += 1;
    saveState.value = content === lastSavedContent.value ? 'saved' : 'dirty';
    scheduleAutosave();
    if (!isPlainTextDocument.value) {
      schedulePreviewRefresh();
    }
  }

  function schedulePreviewRefresh(): void {
    if (previewTimer) {
      clearTimeout(previewTimer);
    }
    previewTimer = globalThis.setTimeout(
      () => {
        previewContent.value = activeContent.value;
        void resolveActiveAssets();
      },
      activeContent.value.length >= LARGE_DOCUMENT_THRESHOLD
        ? LARGE_DOCUMENT_PREVIEW_REFRESH_DELAY
        : PREVIEW_REFRESH_DELAY,
    );
  }

  async function flushPreview(): Promise<void> {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = undefined;
    }
    if (previewContent.value !== activeContent.value) {
      previewContent.value = activeContent.value;
    }
    await resolveActiveAssets();
  }

  function scheduleAutosave(): void {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
    }
    if (untitledDraft.value || !preferences.value.autoSaveEnabled || saveState.value !== 'dirty') {
      return;
    }
    autosaveTimer = globalThis.setTimeout(
      () => void saveActiveDocument(),
      preferences.value.autoSaveDelay,
    );
  }

  async function saveActiveDocument(): Promise<boolean> {
    for (;;) {
      while (savePromise) {
        if (!(await savePromise)) {
          return false;
        }
      }

      if (untitledDraft.value) {
        if (activeContent.value !== lastSavedContent.value) {
          draftSaveRequested.value = true;
          return false;
        }
        return true;
      }

      const path = activePath.value;
      if (!path) {
        return true;
      }

      if (activeContent.value === lastSavedContent.value) {
        saveState.value = 'saved';
        return true;
      }

      const contentToSave = activeContent.value;
      const current =
        activeLoadedDocument.value?.path === path ? activeLoadedDocument.value : undefined;
      saveState.value = 'saving';
      const task = (async (): Promise<boolean> => {
        try {
          if (!current) {
            throw new WorkspaceError('NOT_FOUND', '当前文档不存在。');
          }

          if (isStandaloneFile.value) {
            downloadMarkdown(contentToSave, {
              filename: activeName.value.replace(/\.(?:md|markdown)$/i, ''),
              title: parsedDocument.value.metadata.title || activeName.value,
            });
          } else if (!isDemo.value) {
            if (!current.handle) {
              throw new WorkspaceError('NOT_FOUND', '当前文档句柄不可用。');
            }
            await writeTextFile(current.handle, contentToSave);
          }

          const updated: LoadedDocument = {
            ...current,
            content: contentToSave,
            parsed: parseMarkdownDocument(contentToSave, { path }),
          };
          activeLoadedDocument.value = updated;
          if (updated.category !== 'text') {
            documents.value = new Map(documents.value).set(path, updated);
            await searchController.upsert(createSearchDocument(updated));
          }

          if (activePath.value === path) {
            lastSavedContent.value = contentToSave;
            lastSavedAt.value = new Date();
            saveState.value = activeContent.value === contentToSave ? 'saved' : 'dirty';
          }
          if (isStandaloneFile.value) {
            notify('success', '已下载更新后的 Markdown', activeName.value);
          }
          return true;
        } catch (error) {
          if (activePath.value === path) {
            saveState.value = 'error';
          }
          notify('error', '保存失败', toMessage(error));
          return false;
        }
      })();

      try {
        savePromise = task;
        if (!(await task)) {
          return false;
        }
      } finally {
        if (savePromise === task) {
          savePromise = null;
        }
      }
    }
  }

  function cancelUntitledDraftSave(): void {
    draftSaveRequested.value = false;
  }

  async function saveUntitledDraft(requestedName: string): Promise<boolean> {
    if (!untitledDraft.value || isDemo.value) {
      return false;
    }

    const name = normalizeMarkdownName(requestedName);
    if (!name) {
      return false;
    }

    const handle = rootHandle.value;
    if (!handle) {
      notify('error', '保存失败', '工作空间未打开。');
      return false;
    }

    const content = activeContent.value;
    try {
      const fileHandle = await createMarkdownFile(handle, name, content);
      const document: LoadedDocument = {
        path: name,
        name,
        content,
        parsed: parseMarkdownDocument(content, { path: name }),
        handle: markRaw(fileHandle),
      };
      documents.value = new Map(documents.value).set(name, document);
      activePath.value = name;
      activeLoadedDocument.value = document;
      untitledDraft.value = false;
      draftSaveRequested.value = false;
      setDocumentLockState(name, false);
      activeContent.value = content;
      previewContent.value = content;
      lastSavedContent.value = content;
      lastSavedAt.value = new Date();
      saveState.value = 'saved';
      await searchController.upsert(createSearchDocument(document));
      try {
        await refreshWorkspace();
      } catch {
        notify('info', '文件已保存', '文件树将在下次刷新时更新。');
      }
      notify('success', 'Markdown 文件已保存', name);
      return true;
    } catch (error) {
      notify('error', '保存失败', toMessage(error));
      return false;
    }
  }

  async function refreshWorkspace(options: { feedback?: boolean } = {}): Promise<void> {
    if (refreshing.value) {
      return;
    }

    refreshing.value = true;
    const startedAt = Date.now();
    try {
      if (isDemo.value) {
        await loadDemoWorkspace();
        if (options.feedback) {
          notify('success', '示例工作空间已刷新', '已重新载入示例文档。');
        }
        return;
      }

      if (!rootHandle.value) {
        if (options.feedback) {
          notify('info', '没有可刷新的工作空间', '请先打开本地文件夹。');
        }
        return;
      }

      const operation = ++workspaceOperationSequence;
      const documentOperation = ++documentOpenSequence;
      const handle = rootHandle.value;
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        if (options.feedback) {
          notify('info', '刷新已取消', '请先处理当前文档的保存失败问题。');
        }
        return;
      }
      if (operation !== workspaceOperationSequence) {
        return;
      }
      const contentRevision = activeContentRevision;
      const result = await scanWorkspace(handle, {
        includeImagesInTree: true,
        includeOtherFiles: true,
      });
      if (operation !== workspaceOperationSequence) {
        return;
      }
      const activePathBeforeRefresh = activePath.value;
      const activeTextNode = result.files.find(
        (node) => node.path === activePathBeforeRefresh && node.category === 'text',
      );
      let refreshedActiveText: LoadedDocument | null = null;
      if (activeTextNode) {
        const content = await readTextFile(activeTextNode.handle);
        refreshedActiveText = {
          path: activeTextNode.path,
          name: activeTextNode.name,
          content,
          parsed: parseMarkdownDocument(content, { path: activeTextNode.path }),
          category: 'text',
          handle: markRaw(activeTextNode.handle),
        };
      }
      const refreshedDocuments = await hydrateDocumentIndex(result.documents, operation, {
        publishDocuments: false,
        seedDocuments: new Map(),
        updateSearch: false,
      });
      if (operation !== workspaceOperationSequence) {
        return;
      }

      const previousDocuments = documents.value;
      const activePathAtCommit = activePath.value;
      const activeContentAtCommit = activeContent.value;
      const activeChangedDuringRefresh =
        documentOperation !== documentOpenSequence || contentRevision !== activeContentRevision;
      const activeRefreshedDocument = activePathAtCommit
        ? (refreshedActiveText ?? refreshedDocuments.get(activePathAtCommit))
        : undefined;

      if (activePathAtCommit && activeChangedDuringRefresh) {
        const activePreviousDocument =
          activeLoadedDocument.value?.path === activePathAtCommit
            ? activeLoadedDocument.value
            : previousDocuments.get(activePathAtCommit);
        const baseDocument = activeRefreshedDocument ?? activePreviousDocument;
        if (baseDocument) {
          const preservedDocument = {
            ...baseDocument,
            content: activeContentAtCommit,
            parsed: parseMarkdownDocument(activeContentAtCommit, {
              path: activePathAtCommit,
            }),
          };
          if (preservedDocument.category === 'text') {
            refreshedActiveText = preservedDocument;
          } else {
            refreshedDocuments.set(activePathAtCommit, preservedDocument);
          }
        }
      }

      treeRoot.value = markRaw(cloneDisplayTree(result.root));
      documentNodes.value = result.documents.map((node) => markRaw(node));
      fileNodes.value = result.files.map((node) => markRaw(node));
      assets.value = result.assets.map((node) => ({
        name: node.name,
        path: node.path,
        handle: markRaw(node.handle),
      }));
      documents.value = new Map(refreshedDocuments);
      searchResults.value = [];

      const editableFileCount = result.files.filter(
        (node) => node.category === 'markdown' || node.category === 'text',
      ).length;
      if (editableFileCount === 0) {
        startUntitledDraft();
      } else if (activePathAtCommit) {
        const committedDocument =
          refreshedActiveText?.path === activePathAtCommit
            ? refreshedActiveText
            : documents.value.get(activePathAtCommit);
        if (!committedDocument) {
          activePath.value = '';
          activeLoadedDocument.value = null;
          activeContent.value = '';
          previewContent.value = '';
          lastSavedContent.value = '';
          saveState.value = 'idle';
          activeContentRevision += 1;
        } else if (!activeChangedDuringRefresh) {
          activeContent.value = committedDocument.content;
          previewContent.value = committedDocument.content;
          lastSavedContent.value = committedDocument.content;
          saveState.value = 'saved';
          activeLoadedDocument.value = committedDocument;
          activeContentRevision += 1;
          if (committedDocument.category === 'text') {
            releaseActiveObjectUrls();
            assetUrls.value = {};
          } else {
            await resolveActiveAssets();
          }
        }
      }

      await searchController.replaceAll([...documents.value.values()].map(createSearchDocument));
      if (
        operation === workspaceOperationSequence &&
        activeChangedDuringRefresh &&
        activePath.value === activePathAtCommit
      ) {
        await resolveActiveAssets();
      }
      if (options.feedback) {
        notify('success', '工作空间已刷新', `已检查 ${result.documents.length} 个 Markdown 文件。`);
      }
    } catch (error) {
      if (options.feedback) {
        notify('error', '刷新失败', toMessage(error));
        return;
      }
      throw error;
    } finally {
      const remainingDuration = options.feedback
        ? MINIMUM_REFRESH_INDICATOR_DURATION - (Date.now() - startedAt)
        : 0;
      if (remainingDuration > 0) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, remainingDuration));
      }
      refreshing.value = false;
    }
  }

  async function parentDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    if (!rootHandle.value) {
      throw new WorkspaceError('NOT_FOUND', '工作空间未打开。');
    }
    const parentPath = directoryPath(path);
    if (!parentPath) {
      return rootHandle.value;
    }
    const parent = await getDirectoryHandleByRelativePath(rootHandle.value, parentPath);
    if (!parent) {
      throw new WorkspaceError('NOT_FOUND', '父文件夹不存在。');
    }
    return parent;
  }

  async function directoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
    if (!rootHandle.value) {
      throw new WorkspaceError('NOT_FOUND', '工作空间未打开。');
    }
    if (!path) {
      return rootHandle.value;
    }
    const handle = await getDirectoryHandleByRelativePath(rootHandle.value, path);
    if (!handle) {
      throw new WorkspaceError('NOT_FOUND', '文件夹不存在。');
    }
    return handle;
  }

  async function createDocument(parentPath: string, requestedName: string): Promise<void> {
    if (isDemo.value) {
      notify('info', '示例模式不会创建文件', '请打开本地文件夹后使用此功能。');
      return;
    }
    const name = normalizeMarkdownName(requestedName);
    if (!name) {
      return;
    }
    try {
      const parent = await directoryHandle(parentPath);
      await createMarkdownFile(parent, name, `# ${name.replace(/\.(?:md|markdown)$/i, '')}\n`);
      await refreshWorkspace();
      const path = parentPath ? `${parentPath}/${name}` : name;
      await openDocument(path);
      notify('success', 'Markdown 文件已创建', name);
    } catch (error) {
      notify('error', '创建失败', toMessage(error));
    }
  }

  async function createFolder(parentPath: string, name: string): Promise<void> {
    if (isDemo.value) {
      notify('info', '示例模式不会创建文件夹', '请打开本地文件夹后使用此功能。');
      return;
    }
    if (!name.trim()) {
      return;
    }
    try {
      const parent = await directoryHandle(parentPath);
      await createDirectory(parent, name.trim());
      await refreshWorkspace();
      notify('success', '文件夹已创建', name.trim());
    } catch (error) {
      notify('error', '创建失败', toMessage(error));
    }
  }

  async function renameNode(node: DisplayTreeNode, requestedName: string): Promise<void> {
    if (isDemo.value) {
      notify('info', '示例模式不会重命名文件', '请打开本地文件夹后使用此功能。');
      return;
    }
    let name = requestedName.trim();
    if (!name || name === node.name) {
      return;
    }
    if (node.kind === 'file' && !extensionOf(name) && extensionOf(node.name)) {
      name += extensionOf(node.name);
    }

    try {
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return;
      }
      const parent = await parentDirectoryHandle(node.path);
      await renameEntry(parent, node.name, name);
      const nextPath = directoryPath(node.path) ? `${directoryPath(node.path)}/${name}` : name;
      const wasActive =
        activePath.value === node.path || activePath.value.startsWith(`${node.path}/`);
      if (wasActive) {
        activePath.value = '';
        activeLoadedDocument.value = null;
        activeContent.value = '';
        previewContent.value = '';
        lastSavedContent.value = '';
      }
      await refreshWorkspace();
      if (node.kind === 'file') {
        await openDocument(nextPath);
      }
      notify('success', '重命名完成', `${node.name} → ${name}`);
    } catch (error) {
      notify('error', '重命名失败', toMessage(error));
    }
  }

  function movedPath(parentPath: string, name: string): string {
    return parentPath ? `${parentPath}/${name}` : name;
  }

  function relocatedActivePath(
    node: DisplayTreeNode,
    fromPath: string,
    toPath: string,
  ): string | null {
    if (fromPath === node.path) {
      return toPath;
    }
    if (node.kind === 'directory' && fromPath.startsWith(`${node.path}/`)) {
      return `${toPath}${fromPath.slice(node.path.length)}`;
    }
    return null;
  }

  async function moveNode(node: DisplayTreeNode, destinationParentPath: string): Promise<void> {
    if (isDemo.value) {
      notify('info', '示例模式不会移动文件', '请打开本地文件夹后使用此功能。');
      return;
    }
    if (moveInProgress) {
      return;
    }

    const sourceParentPath = directoryPath(node.path);
    if (sourceParentPath === destinationParentPath) {
      return;
    }
    if (
      node.kind === 'directory' &&
      (destinationParentPath === node.path || destinationParentPath.startsWith(`${node.path}/`))
    ) {
      notify('error', '无法移动文件夹', '不能移动到自身或其子文件夹中。');
      return;
    }

    moveInProgress = true;
    try {
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return;
      }
      const sourceParent = await directoryHandle(sourceParentPath);
      const destinationParent = await directoryHandle(destinationParentPath);
      const activePathAfterMove = relocatedActivePath(
        node,
        activePath.value,
        movedPath(destinationParentPath, node.name),
      );
      await moveEntry(sourceParent, node.name, destinationParent);
      await refreshWorkspace();
      if (activePathAfterMove) {
        await openDocument(activePathAfterMove);
      }

      const move: WorkspaceMove = {
        id: ++moveSequence,
        name: node.name,
        kind: node.kind,
        sourceParentPath,
        destinationParentPath,
      };
      lastMove.value = move;
      notify('success', '移动完成', `${node.name} 已移动，可按 Ctrl / ⌘ + Z 撤回。`, {
        label: '撤回',
        run: () => void undoLastMove(move.id),
      });
    } catch (error) {
      notify('error', '移动失败', toMessage(error));
    } finally {
      moveInProgress = false;
    }
  }

  async function undoLastMove(moveId?: number): Promise<boolean> {
    const move = lastMove.value;
    if (!move || moveInProgress || isDemo.value || (moveId !== undefined && move.id !== moveId)) {
      return false;
    }

    const currentPath = movedPath(move.destinationParentPath, move.name);
    const restoredPath = movedPath(move.sourceParentPath, move.name);
    moveInProgress = true;
    try {
      if (hasEditableDocument.value && !(await saveActiveDocument())) {
        return false;
      }
      const currentParent = await directoryHandle(move.destinationParentPath);
      const originalParent = await directoryHandle(move.sourceParentPath);
      const activePathAfterUndo = relocatedActivePath(
        { kind: move.kind, name: move.name, path: currentPath },
        activePath.value,
        restoredPath,
      );
      await moveEntry(currentParent, move.name, originalParent);
      await refreshWorkspace();
      if (activePathAfterUndo) {
        await openDocument(activePathAfterUndo);
      }
      lastMove.value = null;
      notify('success', '已撤回移动', move.name);
      return true;
    } catch (error) {
      notify('error', '撤回失败', toMessage(error));
      return false;
    } finally {
      moveInProgress = false;
    }
  }

  async function removeNode(node: DisplayTreeNode): Promise<void> {
    if (isDemo.value) {
      notify('info', '示例模式不会删除文件', '请打开本地文件夹后使用此功能。');
      return;
    }
    try {
      const parent = await parentDirectoryHandle(node.path);
      await deleteEntry(parent, node.name, {
        recursive: node.kind === 'directory',
      });
      if (activePath.value === node.path || activePath.value.startsWith(`${node.path}/`)) {
        activePath.value = '';
        activeLoadedDocument.value = null;
        activeContent.value = '';
        previewContent.value = '';
        lastSavedContent.value = '';
        saveState.value = 'idle';
      }
      await refreshWorkspace();
      notify('success', '已永久删除', node.name);
    } catch (error) {
      notify('error', '删除失败', toMessage(error));
    }
  }

  async function performSearch(query = searchQuery.value): Promise<void> {
    searchQuery.value = query;
    searchResults.value = await searchController.search(query, {
      limit: 80,
      prefix: true,
      fuzzy: 0.2,
      maxSnippetLength: 150,
    });
  }

  function selectPanel(panel: WorkspacePanel): void {
    if (activePanel.value === panel && sidebarOpen.value) {
      sidebarOpen.value = false;
      return;
    }
    showPanel(panel);
  }

  function showPanel(panel: WorkspacePanel): void {
    activePanel.value = panel;
    sidebarOpen.value = true;
    if (panel === 'assets') {
      void loadAssetPreviews();
    }
  }

  function selectTag(tag: string): void {
    selectedTag.value = selectedTag.value === tag ? '' : tag;
    activePanel.value = 'tags';
    sidebarOpen.value = true;
  }

  async function openWikiLink(target: string): Promise<void> {
    const source = activeDocument.value ? createKnowledgeDocument(activeDocument.value) : undefined;
    const resolved = resolveWikiLink(target, allKnowledgeDocuments.value, source);
    if (resolved) {
      await openDocument(resolved.path);
    } else {
      notify('info', '未找到双向链接目标', target);
    }
  }

  async function resolveActiveAssets(): Promise<void> {
    assetResolveSequence += 1;
    const sequence = assetResolveSequence;
    const documentPath = activePath.value;

    if (!hasEditableDocument.value) {
      releaseActiveObjectUrls();
      assetUrls.value = {};
      return;
    }

    if (isDemo.value) {
      releaseActiveObjectUrls();
      activeAssetDocumentPath = documentPath;
      assetUrls.value = Object.fromEntries(
        assets.value.filter((asset) => asset.url).map((asset) => [asset.path, asset.url as string]),
      );
      return;
    }

    const handle = rootHandle.value;
    if (!handle) {
      return;
    }

    if (activeAssetDocumentPath !== documentPath) {
      releaseActiveObjectUrls();
      activeAssetDocumentPath = documentPath;
    }

    const parsed = parsedDocument.value;
    const nextUrls: Record<string, string> = {};
    const desiredPaths = new Set(
      parsed.relativeImagePaths
        .map((rawPath) => resolveRelativeAssetPath(documentPath, rawPath))
        .filter((path): path is string => Boolean(path)),
    );
    const createdUrls = new Map<string, string>();

    await Promise.all(
      [...desiredPaths].map(async (resolved) => {
        const cachedUrl = activeObjectUrls.get(resolved);
        if (cachedUrl) {
          nextUrls[resolved] = cachedUrl;
          return;
        }
        try {
          const fileHandle = await getFileHandleByRelativePath(handle, resolved);
          if (!fileHandle) {
            return;
          }
          const file = await readFile(fileHandle);
          if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            return;
          }
          const url = URL.createObjectURL(file);
          createdUrls.set(resolved, url);
          nextUrls[resolved] = url;
        } catch {
          // 单张图片不可读不阻断文档。
        }
      }),
    );

    if (sequence !== assetResolveSequence || documentPath !== activePath.value) {
      for (const url of createdUrls.values()) {
        URL.revokeObjectURL(url);
      }
      return;
    }

    for (const [path, url] of activeObjectUrls) {
      if (!desiredPaths.has(path)) {
        URL.revokeObjectURL(url);
        activeObjectUrls.delete(path);
      }
    }
    for (const [path, url] of createdUrls) {
      activeObjectUrls.set(path, url);
    }
    assetUrls.value = nextUrls;
  }

  async function loadAssetPreviews(limit = 120): Promise<void> {
    releaseAssetPreviewUrls();
    if (isDemo.value) {
      return;
    }

    const currentAssets = [...assets.value];
    const previews: WorkspaceAsset[] = [];
    for (const asset of currentAssets.slice(0, limit)) {
      if (!asset.handle) {
        previews.push(asset);
        continue;
      }
      try {
        const file = await readFile(asset.handle);
        const url = URL.createObjectURL(file);
        assetPreviewObjectUrls.push(url);
        previews.push({ ...asset, url });
      } catch {
        previews.push(asset);
      }
    }
    const remaining = currentAssets.slice(limit).map((asset) => ({
      name: asset.name,
      path: asset.path,
      ...(asset.handle ? { handle: asset.handle } : {}),
    }));
    assets.value = [...previews, ...remaining];
  }

  async function saveImageAsset(file: File): Promise<string | null> {
    if (
      !ALLOWED_IMAGE_TYPES.has(file.type) &&
      !ALLOWED_IMAGE_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))
    ) {
      notify('error', '不支持的图片格式', '仅支持 PNG、JPG、GIF 和 WebP。');
      return null;
    }

    const initialName = safeAssetName(file.name);
    if (isDemo.value) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const path = `assets/${initialName}`;
      assets.value = [...assets.value, { name: initialName, path, url: dataUrl }];
      assetUrls.value = { ...assetUrls.value, [path]: dataUrl };
      return relativePathBetween(activePath.value, path);
    }

    if (!rootHandle.value) {
      return null;
    }

    try {
      let assetDirectory = await getDirectoryHandleByRelativePath(rootHandle.value, 'assets');
      assetDirectory ??= await createDirectory(rootHandle.value, 'assets');

      const base = initialName.replace(/\.[^.]+$/u, '');
      const extension = extensionOf(initialName) || '.png';
      let finalName = `${base}${extension}`;
      let counter = 2;
      while (await getFileHandleByRelativePath(rootHandle.value, `assets/${finalName}`)) {
        finalName = `${base}-${counter}${extension}`;
        counter += 1;
      }

      await createFile(assetDirectory, finalName, file);
      await refreshWorkspace();
      const path = `assets/${finalName}`;
      notify('success', '图片已保存到 assets', finalName);
      return relativePathBetween(activePath.value, path);
    } catch (error) {
      notify('error', '图片保存失败', toMessage(error));
      return null;
    }
  }

  function assetMarkdownReference(asset: WorkspaceAsset): string {
    const relative = relativePathBetween(activePath.value, asset.path);
    const alt = asset.name.replace(/\.[^.]+$/u, '');
    return `![${alt}](${relative})`;
  }

  async function copyAssetReference(asset: WorkspaceAsset): Promise<void> {
    try {
      await navigator.clipboard.writeText(assetMarkdownReference(asset));
      notify('success', 'Markdown 引用已复制', asset.name);
    } catch {
      notify('error', '复制失败', '浏览器未授予剪贴板权限。');
    }
  }

  async function exportActive(format: ExportExtension): Promise<void> {
    if (!activePath.value) {
      return;
    }
    try {
      await flushPreview();
      const title =
        parsedDocument.value.metadata.title || activeName.value.replace(/\.(?:md|markdown)$/i, '');
      let warnings: readonly string[] = [];
      if (format === 'md') {
        warnings = downloadMarkdown(activeContent.value, {
          filename: title,
          title,
        }).warnings;
      } else {
        const exportOptions = {
          filename: title,
          resolveImageBlob: resolveWorkspaceExportImage,
          title,
        };
        if (format === 'html') {
          warnings = (await downloadHtml(previewHtml.value, exportOptions)).warnings;
        } else if (format === 'png') {
          warnings = (await downloadImage(previewHtml.value, exportOptions)).warnings;
        } else if (format === 'pdf') {
          warnings = (await downloadPdf(previewHtml.value, exportOptions)).warnings;
        } else {
          warnings = (
            await downloadDocx(previewHtml.value, {
              ...exportOptions,
              creator: 'Meowv Studio',
            })
          ).warnings;
        }
      }
      if (warnings.length) {
        notify(
          'info',
          format === 'pdf' && warnings.some((warning) => warning.startsWith('PDF 无法加载线上图片'))
            ? 'PDF 已导出，部分线上图片使用占位'
            : '导出已生成，部分内容已调整',
          warnings.slice(0, 2).join('；'),
        );
      } else {
        notify('success', '导出已生成', `${title}.${format}`);
      }
    } catch (error) {
      notify('error', '导出失败', toMessage(error));
    }
  }

  async function resolveWorkspaceExportImage(source: string): Promise<Blob | undefined> {
    const handle = rootHandle.value;
    if (!handle) {
      return undefined;
    }

    const path = [...activeObjectUrls.entries()].find(([, url]) => url === source)?.[0];
    if (!path) {
      return undefined;
    }

    const fileHandle = await getFileHandleByRelativePath(handle, path);
    return fileHandle ? await readFile(fileHandle) : undefined;
  }

  function releaseActiveObjectUrls(): void {
    for (const url of activeObjectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    activeObjectUrls = new Map();
    activeAssetDocumentPath = '';
    assetUrls.value = {};
  }

  function releaseAssetPreviewUrls(): void {
    for (const url of assetPreviewObjectUrls) {
      URL.revokeObjectURL(url);
    }
    assetPreviewObjectUrls = [];
  }

  function releaseAllObjectUrls(): void {
    releaseActiveObjectUrls();
    releaseAssetPreviewUrls();
  }

  function setCursor(line: number, column: number): void {
    cursorLine.value = Math.max(1, line);
    cursorColumn.value = Math.max(1, column);
  }

  function dispose(): void {
    workspaceOperationSequence += 1;
    documentOpenSequence += 1;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
    }
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = undefined;
    }
    releaseAllObjectUrls();
    searchController.dispose();
  }

  watch(
    () => preferences.value.autoSaveDelay,
    () => scheduleAutosave(),
  );

  return {
    initialized,
    busy,
    refreshing,
    indexing,
    isDemo,
    isStandaloneFile,
    workspaceName,
    recentDirectory,
    workspaceHistory,
    workspaceHistoryId,
    untitledDraft,
    draftSaveRequested,
    treeRoot,
    assets,
    activePath,
    isActiveDocumentLocked,
    activeContent,
    saveState,
    lastSavedAt,
    activePanel,
    sidebarOpen,
    mobileView,
    fullscreenPane,
    searchQuery,
    searchResults,
    selectedTag,
    preferences,
    cursorLine,
    cursorColumn,
    toasts,
    hasWorkspace,
    hasEditableDocument,
    fileSystemSupported,
    canUndoMove,
    activeDocument,
    isPlainTextDocument,
    activeName,
    resolvedTheme,
    parsedDocument,
    previewHtml,
    tagCounts,
    activeBacklinks,
    knowledgeGraph,
    selectedTagDocuments,
    initialize,
    updatePreferences,
    setLayoutWidth,
    persistLayoutWidths,
    toggleFullscreen,
    toggleEditorVisibility,
    toggleActiveDocumentLock,
    openLocalWorkspace,
    reopenRecentWorkspace,
    openWorkspaceHistory,
    loadDemoWorkspace,
    loadStandaloneFile,
    openDocument,
    updateContent,
    saveActiveDocument,
    cancelUntitledDraftSave,
    saveUntitledDraft,
    refreshWorkspace,
    createDocument,
    createFolder,
    renameNode,
    moveNode,
    undoLastMove,
    removeNode,
    performSearch,
    selectPanel,
    showPanel,
    selectTag,
    openWikiLink,
    loadAssetPreviews,
    saveImageAsset,
    assetMarkdownReference,
    copyAssetReference,
    exportActive,
    setCursor,
    notify,
    dismissToast,
    dispose,
  };
});

export type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;
