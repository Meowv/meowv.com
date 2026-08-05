import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Excalidraw,
  loadFromBlob,
  loadLibraryFromBlob,
  MainMenu,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  LibraryItems,
} from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import '@/features/draw/editor.css';
import { downloadBlob } from '@/features/image/utils/download';
import {
  EMPTY_DRAW_SCENE,
  clearDrawDocuments,
  createDrawDocument,
  deleteDrawDocument,
  duplicateDrawDocument,
  getDrawLibrary,
  getDrawSettings,
  listDrawDocuments,
  renameDrawDocument,
  saveDrawDocument,
  saveDrawLibrary,
  touchDrawDocument,
  updateDrawSettings,
  type DrawDocumentRecord,
} from '@/features/draw/storage';

type SceneElements = Parameters<NonNullable<ExcalidrawProps['onChange']>>[0];
type SaveState = 'loading' | 'saved' | 'saving' | 'dirty' | 'failed' | 'unavailable';
type DialogState =
  | { type: 'rename'; document: DrawDocumentRecord }
  | { type: 'delete'; document: DrawDocumentRecord }
  | { type: 'clear' }
  | null;
type ExtraToolType = 'frame' | 'embeddable' | 'laser';
type HeaderIconName =
  | 'new'
  | 'open'
  | 'history'
  | 'download'
  | 'library'
  | 'help'
  | 'chevronUp'
  | 'chevronDown'
  | 'fullscreen'
  | 'exitFullscreen';

interface SceneSnapshot {
  elements: SceneElements;
  appState: AppState;
  files: BinaryFiles;
}

interface DrawEditorOptions {
  returnToStudio: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

interface CommandItem {
  label: string;
  keywords: string;
  shortcut?: string;
  onSelect: () => void;
}

const EMPTY_LIBRARY: LibraryItems = [];

function createTemporaryDocument(
  title = '未命名画板',
  sceneJson = EMPTY_DRAW_SCENE,
): DrawDocumentRecord {
  const timestamp = Date.now();
  return {
    id: `temporary:${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    sceneJson,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    elementCount: 0,
    size: new Blob([sceneJson]).size,
  };
}

function parseScene(sceneJson: string): ExcalidrawInitialDataState {
  const scene: unknown = JSON.parse(sceneJson);
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    throw new Error('画板文件格式无效。');
  }
  return scene as ExcalidrawInitialDataState;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function safeFilename(title: string): string {
  const cleanTitle = title
    .trim()
    .split('')
    .filter((character) => character >= ' ')
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.+$/g, '');
  return cleanTitle || '未命名画板';
}

function getStudioTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function hasDrawnElements(scene: ExcalidrawInitialDataState): boolean {
  return Array.isArray(scene.elements) && scene.elements.some((element) => !element.isDeleted);
}

function getExtraToolType(type: AppState['activeTool']['type']): ExtraToolType | null {
  return type === 'frame' || type === 'embeddable' || type === 'laser' ? type : null;
}

function SaveIndicator({ state }: { state: SaveState }): ReactNode {
  const labels: Record<SaveState, string> = {
    loading: '正在恢复…',
    saved: '已自动保存',
    saving: '正在保存…',
    dirty: '有未保存更改',
    failed: '保存失败',
    unavailable: '本地保存不可用',
  };
  return createElement(
    'span',
    { className: `draw-editor__save-state draw-editor__save-state--${state}`, role: 'status' },
    createElement('span', { 'aria-hidden': true }),
    labels[state],
  );
}

function HeaderButton({
  children,
  onClick,
  title,
  primary = false,
  iconOnly = false,
  buttonRef,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  primary?: boolean;
  iconOnly?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}): ReactNode {
  return createElement(
    'button',
    {
      ref: buttonRef,
      className: `draw-editor__header-button${primary ? ' draw-editor__header-button--primary' : ''}${iconOnly ? ' draw-editor__header-button--icon' : ''}`,
      type: 'button',
      onClick,
      'aria-label': title,
      'data-tooltip': iconOnly ? title : undefined,
    },
    children,
  );
}

function HeaderToggle({ visible, onClick }: { visible: boolean; onClick: () => void }): ReactNode {
  const title = visible ? '隐藏顶部栏' : '显示顶部栏';
  return createElement(
    'button',
    {
      className: `draw-editor__header-toggle${visible ? '' : ' draw-editor__header-toggle--collapsed'}`,
      type: 'button',
      onClick,
      'aria-label': title,
    },
    HeaderIcon({ name: visible ? 'chevronUp' : 'chevronDown' }),
  );
}

function HeaderIcon({ name }: { name: HeaderIconName }): ReactNode {
  const svgProps = {
    className: 'draw-editor__header-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'new') {
    return createElement(
      'svg',
      svgProps,
      createElement('path', { d: 'M12 5v14' }),
      createElement('path', { d: 'M5 12h14' }),
    );
  }
  if (name === 'open') {
    return createElement(
      'svg',
      svgProps,
      createElement('path', { d: 'M5 19l2.5 -9h11l-2.5 9z' }),
      createElement('path', { d: 'M7.5 10l1.5 -5h4l2 2h4a2 2 0 0 1 2 2v1' }),
    );
  }
  if (name === 'history') {
    return createElement(
      'svg',
      svgProps,
      createElement('path', { d: 'M3 12a9 9 0 1 0 3 -6.7' }),
      createElement('path', { d: 'M3 4v5h5' }),
      createElement('path', { d: 'M12 7v5l3 2' }),
    );
  }
  if (name === 'download') {
    return createElement(
      'svg',
      svgProps,
      createElement('path', { d: 'M12 3v12' }),
      createElement('path', { d: 'M7 10l5 5l5 -5' }),
      createElement('path', { d: 'M5 21h14' }),
    );
  }
  if (name === 'library') {
    return createElement(
      'svg',
      svgProps,
      createElement(
        'g',
        { strokeWidth: 1.25 },
        createElement('path', { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' }),
        createElement('path', { d: 'M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0' }),
        createElement('path', { d: 'M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0' }),
        createElement('line', { x1: 3, y1: 6, x2: 3, y2: 19 }),
        createElement('line', { x1: 12, y1: 6, x2: 12, y2: 19 }),
        createElement('line', { x1: 21, y1: 6, x2: 21, y2: 19 }),
      ),
    );
  }
  if (name === 'help') {
    return createElement(
      'svg',
      svgProps,
      createElement('circle', { cx: 12, cy: 12, r: 8.5 }),
      createElement('path', { d: 'M9.7 9.4a2.6 2.6 0 0 1 5 1c0 1.8 -2.7 2 -2.7 3.9' }),
      createElement('path', { d: 'M12 17.1h.01' }),
    );
  }
  if (name === 'chevronUp') {
    return createElement('svg', svgProps, createElement('path', { d: 'M6 15l6 -6l6 6' }));
  }
  if (name === 'chevronDown') {
    return createElement('svg', svgProps, createElement('path', { d: 'M6 9l6 6l6 -6' }));
  }
  if (name === 'fullscreen') {
    return createElement(
      'svg',
      svgProps,
      createElement('path', { d: 'M8 3h-3a2 2 0 0 0 -2 2v3' }),
      createElement('path', { d: 'M16 3h3a2 2 0 0 1 2 2v3' }),
      createElement('path', { d: 'M8 21h-3a2 2 0 0 1 -2 -2v-3' }),
      createElement('path', { d: 'M16 21h3a2 2 0 0 0 2 -2v-3' }),
    );
  }
  return createElement(
    'svg',
    svgProps,
    createElement('path', { d: 'M5 9v-2a2 2 0 0 1 2 -2h2' }),
    createElement('path', { d: 'M19 9v-2a2 2 0 0 0 -2 -2h-2' }),
    createElement('path', { d: 'M5 15v2a2 2 0 0 0 2 2h2' }),
    createElement('path', { d: 'M19 15v2a2 2 0 0 1 -2 2h-2' }),
  );
}

function StudioHomeButton({ onClick }: { onClick: () => void }): ReactNode {
  return createElement(
    'button',
    {
      className: 'draw-editor__studio-logo studio-logo',
      type: 'button',
      onClick,
      'aria-label': '返回 Meowv Studio 首页',
    },
    createElement('img', {
      src: '/brand/studio.png',
      alt: '',
      width: 36,
      height: 36,
      draggable: false,
    }),
    createElement(
      'span',
      { className: 'studio-logo__wordmark home-copy__product--animated' },
      createElement('strong', null, 'Meowv'),
      ' Studio',
    ),
    createElement('span', { className: 'studio-logo__leaf', 'aria-hidden': true }, '●'),
  );
}

function EmptyGuide({ onOpen, onHelp }: { onOpen: () => void; onHelp: () => void }): ReactNode {
  return createElement(
    'aside',
    {
      className: 'draw-editor__empty-guide',
      role: 'status',
      'aria-live': 'polite',
      'aria-label': '白板使用引导',
    },
    createElement(
      'div',
      { className: 'draw-editor__empty-guide-brand' },
      createElement('img', {
        src: '/brand/studio.png',
        alt: '',
        width: 42,
        height: 42,
        draggable: false,
      }),
      createElement(
        'span',
        { className: 'draw-editor__empty-guide-wordmark home-copy__product--animated' },
        createElement('strong', null, 'Meowv'),
        ' Studio',
      ),
      createElement('span', { className: 'studio-logo__leaf', 'aria-hidden': true }, '●'),
    ),
    createElement(
      'strong',
      { className: 'draw-editor__empty-guide-title' },
      '从上方工具栏开始绘制',
    ),
    createElement('p', null, '白板会自动保存在当前浏览器中。为避免意外清除，建议定期保存备份。'),
    createElement(
      'div',
      { className: 'draw-editor__empty-guide-actions' },
      createElement(
        'button',
        { type: 'button', onClick: onOpen, 'aria-label': '打开本地 Excalidraw 文件' },
        HeaderIcon({ name: 'open' }),
        createElement('span', null, '打开'),
        createElement('kbd', null, 'Cmd+O'),
      ),
      createElement(
        'button',
        { type: 'button', onClick: onHelp, 'aria-label': '打开白板帮助' },
        HeaderIcon({ name: 'help' }),
        createElement('span', null, '帮助'),
        createElement('kbd', null, '?'),
      ),
    ),
  );
}

function DrawEditor({ returnToStudio, setTheme }: DrawEditorOptions): ReactNode {
  const editorRootRef = useRef<HTMLElement | null>(null);
  const libraryButtonRef = useRef<HTMLButtonElement | null>(null);
  const libraryPanelRef = useRef<HTMLElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const activeDocumentRef = useRef<DrawDocumentRecord | null>(null);
  const sceneRef = useRef<SceneSnapshot | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const librarySaveTimerRef = useRef<number | null>(null);
  const materialLibraryOpenRef = useRef(false);
  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const dirtyRef = useRef(false);
  const sceneVersionRef = useRef(0);
  const restoringRef = useRef(false);
  const storageEnabledRef = useRef(true);
  const persistRequestedRef = useRef(false);
  const libraryRef = useRef<LibraryItems>(EMPTY_LIBRARY);

  const [documents, setDocuments] = useState<DrawDocumentRecord[]>([]);
  const [activeDocument, setActiveDocument] = useState<DrawDocumentRecord | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [notice, setNotice] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [renameValue, setRenameValue] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [activeExtraTool, setActiveExtraTool] = useState<ExtraToolType | null>(null);
  const [studioTheme, setStudioTheme] = useState<'light' | 'dark'>(getStudioTheme);
  const [showEmptyGuide, setShowEmptyGuide] = useState(false);
  const studioThemeRef = useRef(studioTheme);

  const replaceDocument = useCallback((record: DrawDocumentRecord) => {
    setDocuments((current) =>
      [...current.filter((document) => document.id !== record.id), record].sort(
        (first, second) => second.lastOpenedAt - first.lastOpenedAt,
      ),
    );
  }, []);

  const saveCurrentScene = useCallback(async (): Promise<void> => {
    const document = activeDocumentRef.current;
    const scene = sceneRef.current;
    if (!document || !scene || !storageEnabledRef.current || restoringRef.current) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaveState('saving');
    const savedVersion = sceneVersionRef.current;
    try {
      const sceneJson = serializeAsJSON(scene.elements, scene.appState, scene.files, 'local');
      const savedDocument = await saveDrawDocument(document.id, sceneJson, scene.elements.length);
      if (activeDocumentRef.current?.id === savedDocument.id) {
        activeDocumentRef.current = savedDocument;
        replaceDocument(savedDocument);
      }
      if (sceneVersionRef.current === savedVersion) {
        dirtyRef.current = false;
        setSaveState('saved');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '本地保存失败。';
      setNotice(`${message} 请立即下载源文件备份。`);
      setSaveState('failed');
    } finally {
      savingRef.current = false;
      if (queuedSaveRef.current || dirtyRef.current) {
        queuedSaveRef.current = false;
        saveTimerRef.current = window.setTimeout(() => void saveCurrentScene(), 800);
      }
    }
  }, [replaceDocument]);

  const scheduleSave = useCallback(() => {
    if (!storageEnabledRef.current || restoringRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void saveCurrentScene(), 800);
  }, [saveCurrentScene]);

  const requestPersistentStorage = useCallback(() => {
    if (
      persistRequestedRef.current ||
      !storageEnabledRef.current ||
      typeof navigator.storage?.persist !== 'function'
    ) {
      return;
    }

    persistRequestedRef.current = true;
    void navigator.storage
      .persist()
      .catch(() => false)
      .finally(() => void updateDrawSettings({ storagePersistRequested: true }));
  }, []);

  const setActive = useCallback(
    async (nextDocument: DrawDocumentRecord, skipSave = false): Promise<void> => {
      if (!skipSave) await saveCurrentScene();
      let nextScene: ExcalidrawInitialDataState;
      try {
        nextScene = parseScene(nextDocument.sceneJson);
      } catch {
        setNotice('该画板无法恢复，原始记录已保留。已为你创建新的空白画板。');
        const fallback = storageEnabledRef.current
          ? await createDrawDocument()
          : createTemporaryDocument();
        replaceDocument(fallback);
        await setActive(fallback, true);
        return;
      }

      restoringRef.current = true;
      const currentDocument = storageEnabledRef.current
        ? await touchDrawDocument(nextDocument.id)
        : { ...nextDocument, lastOpenedAt: Date.now() };
      activeDocumentRef.current = currentDocument;
      sceneRef.current = null;
      dirtyRef.current = false;
      setShowEmptyGuide(!hasDrawnElements(nextScene));
      setActiveDocument(currentDocument);
      setTitleDraft(currentDocument.title);
      replaceDocument(currentDocument);
      setSaveState(storageEnabledRef.current ? 'saved' : 'unavailable');
      if (storageEnabledRef.current) {
        void updateDrawSettings({ activeDocumentId: currentDocument.id });
      }
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    },
    [replaceDocument, saveCurrentScene],
  );

  const createDocument = useCallback(
    async (title = '未命名画板', sceneJson = EMPTY_DRAW_SCENE): Promise<void> => {
      await saveCurrentScene();
      const document = storageEnabledRef.current
        ? await createDrawDocument(title, sceneJson)
        : createTemporaryDocument(title, sceneJson);
      replaceDocument(document);
      await setActive(document, true);
      setLibraryOpen(false);
    },
    [replaceDocument, saveCurrentScene, setActive],
  );

  const renameDocument = useCallback(
    async (document: DrawDocumentRecord, title: string): Promise<void> => {
      const trimmedTitle = title.trim() || '未命名画板';
      const renamed = storageEnabledRef.current
        ? await renameDrawDocument(document.id, trimmedTitle)
        : { ...document, title: trimmedTitle, updatedAt: Date.now() };
      replaceDocument(renamed);
      if (activeDocumentRef.current?.id === renamed.id) {
        activeDocumentRef.current = renamed;
        setActiveDocument(renamed);
        setTitleDraft(renamed.title);
      }
    },
    [replaceDocument],
  );

  const exportScene = useCallback(() => {
    const document = activeDocumentRef.current;
    const api = apiRef.current;
    const scene = sceneRef.current;
    if (!document || !scene) return;

    try {
      const elements = api?.getSceneElementsIncludingDeleted() ?? scene.elements;
      const appState = api?.getAppState() ?? scene.appState;
      const files = api?.getFiles() ?? scene.files;
      const sceneJson = serializeAsJSON(elements, appState, files, 'local');
      downloadBlob(
        new Blob([sceneJson], { type: 'application/json;charset=utf-8' }),
        `${safeFilename(titleDraft || document.title)}.excalidraw`,
      );
      setNotice('已下载白板源文件。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '源文件导出失败。';
      setNotice(message);
    }
  }, [titleDraft]);

  const exportStoredDocument = useCallback((document: DrawDocumentRecord) => {
    try {
      downloadBlob(
        new Blob([document.sceneJson], { type: 'application/json;charset=utf-8' }),
        `${safeFilename(document.title)}.excalidraw`,
      );
      setNotice('已下载白板源文件。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '源文件导出失败。';
      setNotice(message);
    }
  }, []);

  const handleSceneChange = useCallback(
    (elements: SceneElements, appState: AppState, files: BinaryFiles) => {
      if (restoringRef.current || !activeDocumentRef.current) return;
      if (appState.theme !== studioThemeRef.current) setTheme(appState.theme);
      const nextExtraTool = getExtraToolType(appState.activeTool.type);
      setActiveExtraTool((current) => (current === nextExtraTool ? current : nextExtraTool));
      sceneRef.current = { elements, appState, files };
      sceneVersionRef.current += 1;
      if (elements.some((element) => !element.isDeleted)) setShowEmptyGuide(false);
      dirtyRef.current = true;
      setSaveState(storageEnabledRef.current ? 'dirty' : 'unavailable');
      requestPersistentStorage();
      scheduleSave();
    },
    [requestPersistentStorage, scheduleSave, setTheme],
  );

  const handleLibraryChange = useCallback((items: LibraryItems) => {
    libraryRef.current = items;
    if (!storageEnabledRef.current) return;
    if (librarySaveTimerRef.current !== null) window.clearTimeout(librarySaveTimerRef.current);
    librarySaveTimerRef.current = window.setTimeout(() => {
      void saveDrawLibrary(items).catch(() => setNotice('素材库本地保存失败。'));
    }, 500);
  }, []);

  const importFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        if (file.name.toLowerCase().endsWith('.excalidrawlib')) {
          const items = await loadLibraryFromBlob(file);
          await apiRef.current?.updateLibrary({ libraryItems: items, merge: true });
          setNotice('素材库已合并到本地白板。');
          return;
        }

        if (!file.name.toLowerCase().endsWith('.excalidraw')) {
          throw new Error('无法识别该 Excalidraw 文件。');
        }
        const loadedScene = await loadFromBlob(file, null, null);
        const sceneJson = serializeAsJSON(
          loadedScene.elements,
          loadedScene.appState,
          loadedScene.files,
          'local',
        );
        const title = file.name.replace(/\.excalidraw$/i, '').trim() || '未命名画板';
        await createDocument(title, sceneJson);
        setNotice('已作为新的本地画板打开。');
      } catch (error) {
        const message = error instanceof Error ? error.message : '无法识别该 Excalidraw 文件。';
        setNotice(message);
      }
    },
    [createDocument],
  );

  const deleteDocument = useCallback(
    async (document: DrawDocumentRecord) => {
      if (document.id === activeDocumentRef.current?.id) await saveCurrentScene();
      if (storageEnabledRef.current) await deleteDrawDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      if (document.id === activeDocumentRef.current?.id) {
        const nextDocument = storageEnabledRef.current
          ? await createDrawDocument()
          : createTemporaryDocument();
        replaceDocument(nextDocument);
        await setActive(nextDocument, true);
      }
    },
    [replaceDocument, saveCurrentScene, setActive],
  );

  const clearDocuments = useCallback(async () => {
    await saveCurrentScene();
    if (storageEnabledRef.current) await clearDrawDocuments();
    const nextDocument = storageEnabledRef.current
      ? await createDrawDocument()
      : createTemporaryDocument();
    setDocuments([nextDocument]);
    await setActive(nextDocument, true);
  }, [saveCurrentScene, setActive]);

  const duplicateDocument = useCallback(
    async (document: DrawDocumentRecord) => {
      await saveCurrentScene();
      const duplicate = storageEnabledRef.current
        ? await duplicateDrawDocument(document.id)
        : createTemporaryDocument(`${document.title} 副本`, document.sceneJson);
      replaceDocument(duplicate);
      await setActive(duplicate, true);
      setNotice('已创建画板副本。');
    },
    [replaceDocument, saveCurrentScene, setActive],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (fullscreen) {
        if (document.fullscreenElement) await document.exitFullscreen();
        else setFullscreen(false);
      } else {
        setLibraryOpen(false);
        await editorRootRef.current?.requestFullscreen();
      }
      window.setTimeout(() => apiRef.current?.refresh(), 80);
    } catch {
      setNotice('当前浏览器无法进入全屏模式。');
    }
  }, [fullscreen]);

  const toggleExcalidrawLibrary = useCallback(() => {
    if (materialLibraryOpenRef.current) {
      materialLibraryOpenRef.current = false;
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('.sidebar__close')?.click(),
      );
      return;
    }
    materialLibraryOpenRef.current = true;
    apiRef.current?.toggleSidebar({ name: 'default', tab: 'library', force: true });
  }, []);

  const toggleHeader = useCallback(() => {
    const nextHeaderVisible = !headerVisible;
    setHeaderVisible(nextHeaderVisible);
    if (storageEnabledRef.current) {
      void updateDrawSettings({ headerCollapsed: !nextHeaderVisible }).catch(() =>
        setNotice('顶部栏显示偏好未保存。'),
      );
    }
  }, [headerVisible]);

  const openHelpDialog = useCallback(() => {
    const helpButton = editorRootRef.current?.querySelector<HTMLElement>(
      '.excalidraw .layer-ui__wrapper__footer-right .help-icon',
    );
    if (!helpButton) {
      setNotice('白板帮助暂不可用。');
      return;
    }
    helpButton.click();
  }, []);

  const setExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    if (libraryRef.current.length > 0) {
      void api.updateLibrary({ libraryItems: libraryRef.current });
    }
    window.requestAnimationFrame(() => {
      const editorRoot = editorRootRef.current;
      const nativeLabel = editorRoot
        ?.querySelector<HTMLInputElement>('.excalidraw input[aria-label="素材库"]')
        ?.closest('label');
      nativeLabel?.removeAttribute('title');
      nativeLabel?.setAttribute('data-tooltip', '素材库');
      editorRoot
        ?.querySelectorAll<HTMLElement>('.excalidraw .layer-ui__wrapper__footer [title]')
        .forEach((element) => element.removeAttribute('title'));
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    window.requestAnimationFrame(() => {
      setCommandQuery('');
      setCommandPaletteOpen(true);
    });
  }, []);

  const uiOptions = useMemo<ExcalidrawProps['UIOptions']>(
    () => ({
      canvasActions: {
        changeViewBackgroundColor: true,
        clearCanvas: true,
        loadScene: true,
        saveToActiveFile: false,
        saveAsImage: true,
        export: { saveFileToDisk: false },
        toggleTheme: true,
      },
      tools: { image: true },
    }),
    [],
  );

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      const nextTheme = getStudioTheme();
      studioThemeRef.current = nextTheme;
      setStudioTheme(nextTheme);
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const editorRoot = editorRootRef.current;
    if (!editorRoot) return;
    const localizeMenuItems = () => {
      const replacements = new Map([
        ['Find on canvas', '在画布中查找'],
        ['Find text on canvas...', '在画布中查找文字…'],
      ]);
      editorRoot.querySelectorAll<HTMLElement>('.excalidraw *').forEach((element) => {
        ['aria-label', 'title', 'placeholder'].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          const replacement = value ? replacements.get(value) : undefined;
          if (replacement) element.setAttribute(attribute, replacement);
        });
        element.childNodes.forEach((node) => {
          if (node.nodeType !== Node.TEXT_NODE) return;
          const replacement = replacements.get(node.textContent?.trim() ?? '');
          if (replacement) node.textContent = replacement;
        });
      });
    };
    const observer = new MutationObserver(localizeMenuItems);
    observer.observe(editorRoot, { childList: true, subtree: true });
    localizeMenuItems();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const [storedDocuments, settings, storedLibrary] = await Promise.all([
          listDrawDocuments(),
          getDrawSettings(),
          getDrawLibrary<LibraryItems>(),
        ]);
        if (!active) return;
        persistRequestedRef.current = settings.storagePersistRequested;
        setHeaderVisible(settings.headerCollapsed !== true);
        libraryRef.current = storedLibrary?.items ?? EMPTY_LIBRARY;
        const document =
          storedDocuments.find((item) => item.id === settings.activeDocumentId) ??
          storedDocuments[0];
        if (document) {
          setDocuments(storedDocuments);
          await setActive(document, true);
          return;
        }
        await createDocument();
      } catch (error) {
        if (!active) return;
        storageEnabledRef.current = false;
        const message = error instanceof Error ? error.message : '本地存储不可用。';
        setNotice(`${message} 当前画板仅在本次页面打开期间可用。`);
        const temporary = createTemporaryDocument();
        setDocuments([temporary]);
        await setActive(temporary, true);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [createDocument, setActive]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void saveCurrentScene();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      void saveCurrentScene();
      event.preventDefault();
      event.returnValue = '';
    };
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === editorRootRef.current;
      setFullscreen(isFullscreen);
      if (isFullscreen) setLibraryOpen(false);
      window.setTimeout(() => apiRef.current?.refresh(), 0);
    };
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!libraryOpen || !(event.target instanceof Node)) return;
      if (
        libraryButtonRef.current?.contains(event.target) ||
        libraryPanelRef.current?.contains(event.target)
      ) {
        return;
      }
      setLibraryOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('en-US') === 'o') {
        event.preventDefault();
        importInputRef.current?.click();
        return;
      }
      if (event.key !== 'Escape') return;
      if (commandPaletteOpen) setCommandPaletteOpen(false);
      else if (dialog) setDialog(null);
      else if (libraryOpen) setLibraryOpen(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      if (librarySaveTimerRef.current !== null) window.clearTimeout(librarySaveTimerRef.current);
      void saveCurrentScene();
    };
  }, [commandPaletteOpen, dialog, libraryOpen, saveCurrentScene]);

  const activeInitialData = useMemo(
    () => (activeDocument ? parseScene(activeDocument.sceneJson) : null),
    [activeDocument?.id],
  );
  const visibleDocuments = documents.filter((document) =>
    document.title.toLocaleLowerCase('zh-CN').includes(query.trim().toLocaleLowerCase('zh-CN')),
  );
  const commandItems: CommandItem[] = [
    {
      label: '新建空白画板',
      keywords: '新建 创建 画板',
      onSelect: () => void createDocument(),
    },
    {
      label: '打开本地 Excalidraw 文件',
      keywords: '打开 导入 文件 excalidraw',
      shortcut: 'Cmd+O',
      onSelect: () => importInputRef.current?.click(),
    },
    {
      label: '查看本地画板',
      keywords: '本地 画板 历史',
      onSelect: () => setLibraryOpen(true),
    },
    {
      label: '下载 Excalidraw 文件',
      keywords: '下载 导出 文件',
      onSelect: exportScene,
    },
    {
      label: '导出图片',
      keywords: '导出 图片 png svg',
      onSelect: () =>
        apiRef.current?.updateScene({ appState: { openDialog: { name: 'imageExport' } } }),
    },
    {
      label: fullscreen ? '退出全屏' : '进入全屏',
      keywords: '全屏',
      onSelect: () => void toggleFullscreen(),
    },
    {
      label: '打开白板帮助',
      keywords: '帮助 快捷键',
      shortcut: '?',
      onSelect: openHelpDialog,
    },
  ];
  const normalizedCommandQuery = commandQuery.trim().toLocaleLowerCase('zh-CN');
  const visibleCommandItems = commandItems.filter((item) =>
    `${item.label} ${item.keywords}`.toLocaleLowerCase('zh-CN').includes(normalizedCommandQuery),
  );

  const editorProps: ExcalidrawProps = {
    initialData: activeInitialData,
    langCode: 'zh-CN',
    name: activeDocument?.title ?? 'Whiteboard',
    theme: studioTheme,
    excalidrawAPI: setExcalidrawApi,
    onChange: handleSceneChange,
    onLibraryChange: handleLibraryChange,
    autoFocus: true,
    handleKeyboardGlobally: false,
    validateEmbeddable: true,
    UIOptions: uiOptions,
  };

  const mainMenu = createElement(
    MainMenu,
    null,
    createElement(MainMenu.DefaultItems.LoadScene),
    createElement(MainMenu.DefaultItems.SaveToActiveFile),
    createElement(MainMenu.DefaultItems.Export),
    createElement(MainMenu.DefaultItems.SaveAsImage),
    createElement(MainMenu.DefaultItems.SearchMenu),
    createElement(
      MainMenu.Item,
      {
        'aria-label': '命令面板',
        icon: createElement(
          'svg',
          {
            'aria-hidden': true,
            fill: 'none',
            stroke: 'currentColor',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeWidth: 1.7,
            viewBox: '0 0 24 24',
          },
          createElement('path', { d: 'm13 2 -10 12h7l-1 8 12 -15h-8z' }),
        ),
        onSelect: openCommandPalette,
        shortcut: 'Cmd+/',
      },
      '命令面板',
    ),
    createElement(MainMenu.DefaultItems.Help),
    createElement(MainMenu.DefaultItems.ClearCanvas),
    createElement(MainMenu.Separator),
    createElement(MainMenu.DefaultItems.ToggleTheme),
    createElement(MainMenu.DefaultItems.ChangeCanvasBackground),
  );

  const dialogContent = !dialog
    ? null
    : createElement(
        'div',
        {
          className: 'draw-editor__dialog-backdrop',
          onMouseDown: (event: { target: EventTarget | null; currentTarget: EventTarget }) => {
            if (event.target === event.currentTarget) setDialog(null);
          },
        },
        createElement(
          'section',
          {
            className: 'draw-editor__dialog',
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'draw-dialog-title',
          },
          createElement(
            'h2',
            { id: 'draw-dialog-title' },
            dialog.type === 'rename'
              ? '重命名画板'
              : dialog.type === 'delete'
                ? '删除画板'
                : '清空本地画板',
          ),
          dialog.type === 'rename'
            ? createElement('input', {
                autoFocus: true,
                value: renameValue,
                maxLength: 120,
                'aria-label': '画板名称',
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  setRenameValue(event.target.value),
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    void renameDocument(dialog.document, renameValue).then(() => setDialog(null));
                  }
                },
              })
            : createElement(
                'p',
                null,
                dialog.type === 'delete'
                  ? `确定删除“${dialog.document.title}”吗？此操作只删除当前浏览器中的画板。`
                  : '确定清空当前浏览器中的全部画板吗？此操作无法撤销。',
              ),
          createElement(
            'div',
            { className: 'draw-editor__dialog-actions' },
            HeaderButton({ children: '取消', onClick: () => setDialog(null), title: '取消' }),
            HeaderButton({
              children: dialog.type === 'rename' ? '保存名称' : '确认删除',
              primary: true,
              title: dialog.type === 'rename' ? '保存名称' : '确认删除',
              onClick: () => {
                if (dialog.type === 'rename') {
                  void renameDocument(dialog.document, renameValue).then(() => setDialog(null));
                } else if (dialog.type === 'delete') {
                  void deleteDocument(dialog.document).then(() => setDialog(null));
                } else {
                  void clearDocuments().then(() => setDialog(null));
                }
              },
            }),
          ),
        ),
      );

  const commandPaletteContent = commandPaletteOpen
    ? createElement(
        'div',
        {
          className: 'draw-editor__dialog-backdrop',
          onMouseDown: (event: { target: EventTarget | null; currentTarget: EventTarget }) => {
            if (event.target === event.currentTarget) setCommandPaletteOpen(false);
          },
        },
        createElement(
          'section',
          {
            className: 'draw-editor__command-palette',
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'draw-command-palette-title',
          },
          createElement('h2', { id: 'draw-command-palette-title' }, '命令面板'),
          createElement('input', {
            autoFocus: true,
            value: commandQuery,
            placeholder: '搜索命令',
            'aria-label': '搜索命令',
            onChange: (event: ChangeEvent<HTMLInputElement>) => setCommandQuery(event.target.value),
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                const command = visibleCommandItems[0];
                if (!command) return;
                setCommandPaletteOpen(false);
                command.onSelect();
              }
            },
          }),
          createElement(
            'div',
            { className: 'draw-editor__command-list' },
            visibleCommandItems.length
              ? visibleCommandItems.map((command) =>
                  createElement(
                    'button',
                    {
                      className: 'draw-editor__command-item',
                      key: command.label,
                      type: 'button',
                      onClick: () => {
                        setCommandPaletteOpen(false);
                        command.onSelect();
                      },
                    },
                    createElement('span', null, command.label),
                    command.shortcut ? createElement('kbd', null, command.shortcut) : null,
                  ),
                )
              : createElement('p', { className: 'draw-editor__command-empty' }, '没有匹配的命令。'),
          ),
        ),
      )
    : null;

  return createElement(
    'section',
    {
      ref: editorRootRef,
      className: `draw-editor${fullscreen ? ' draw-editor--fullscreen' : ''}${headerVisible ? '' : ' draw-editor--header-collapsed'}`,
      'data-extra-tool': activeExtraTool ?? undefined,
      'aria-label': '白板编辑器',
    },
    !fullscreen && headerVisible
      ? createElement(
          'header',
          { className: 'draw-editor__header' },
          createElement(
            'div',
            { className: 'draw-editor__header-start' },
            StudioHomeButton({ onClick: returnToStudio }),
          ),
          createElement('input', {
            className: 'draw-editor__title',
            value: titleDraft,
            disabled: !activeDocument,
            maxLength: 120,
            'aria-label': '当前画板名称',
            onChange: (event: ChangeEvent<HTMLInputElement>) => setTitleDraft(event.target.value),
            onBlur: () => {
              if (activeDocument && titleDraft !== activeDocument.title) {
                void renameDocument(activeDocument, titleDraft);
              }
            },
          }),
          createElement(
            'div',
            { className: 'draw-editor__header-actions' },
            HeaderButton({
              children: HeaderIcon({ name: 'new' }),
              onClick: () => void createDocument(),
              title: '新建空白画板',
              iconOnly: true,
            }),
            HeaderButton({
              children: HeaderIcon({ name: 'open' }),
              onClick: () => importInputRef.current?.click(),
              title: '打开 .excalidraw 或 .excalidrawlib 文件',
              iconOnly: true,
            }),
            HeaderButton({
              children: HeaderIcon({ name: 'history' }),
              onClick: () => setLibraryOpen((open) => !open),
              title: '查看本地画板',
              iconOnly: true,
              buttonRef: libraryButtonRef,
            }),
            HeaderButton({
              children: HeaderIcon({ name: 'download' }),
              onClick: exportScene,
              title: '下载 .excalidraw 文件',
              iconOnly: true,
            }),
            HeaderButton({
              children: HeaderIcon({ name: 'library' }),
              onClick: toggleExcalidrawLibrary,
              title: '素材库',
              iconOnly: true,
            }),
            HeaderButton({
              children: HeaderIcon({ name: 'fullscreen' }),
              onClick: () => void toggleFullscreen(),
              title: '进入全屏',
              iconOnly: true,
            }),
          ),
        )
      : null,
    !fullscreen
      ? HeaderToggle({
          visible: headerVisible,
          onClick: toggleHeader,
        })
      : createElement(
          'button',
          {
            className:
              'draw-editor__exit-fullscreen draw-editor__header-button draw-editor__header-button--icon',
            type: 'button',
            onClick: () => void toggleFullscreen(),
            'aria-label': '退出全屏',
            'data-tooltip': '退出全屏',
          },
          HeaderIcon({ name: 'exitFullscreen' }),
        ),
    createElement('input', {
      ref: importInputRef,
      className: 'draw-editor__file-input',
      type: 'file',
      accept: '.excalidraw,.excalidrawlib,application/json',
      onChange: importFile,
    }),
    activeDocument
      ? createElement(
          'div',
          { className: 'draw-editor__canvas', key: activeDocument.id },
          createElement(Excalidraw, editorProps, mainMenu),
          showEmptyGuide
            ? EmptyGuide({ onOpen: () => importInputRef.current?.click(), onHelp: openHelpDialog })
            : null,
        )
      : createElement(
          'div',
          { className: 'draw-editor__loading', role: 'status' },
          '正在准备本地白板…',
        ),
    SaveIndicator({ state: saveState }),
    commandPaletteContent,
    notice
      ? createElement(
          'div',
          { className: 'draw-editor__notice', role: 'status' },
          createElement('span', null, notice),
          createElement(
            'button',
            { type: 'button', onClick: () => setNotice(''), 'aria-label': '关闭提示' },
            '×',
          ),
        )
      : null,
    libraryOpen
      ? createElement(
          'aside',
          {
            ref: libraryPanelRef,
            className: `draw-editor__library${headerVisible ? '' : ' draw-editor__library--header-collapsed'}`,
            'aria-label': '本地画板',
          },
          createElement(
            'header',
            null,
            createElement(
              'div',
              null,
              createElement('strong', null, '本地画板'),
              createElement('small', null, '仅保存在当前浏览器中'),
            ),
            HeaderButton({
              children: '新建',
              onClick: () => void createDocument(),
              title: '新建空白画板',
            }),
          ),
          createElement('input', {
            className: 'draw-editor__search',
            value: query,
            placeholder: '搜索画板名称',
            'aria-label': '搜索画板名称',
            onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
          }),
          createElement(
            'div',
            { className: 'draw-editor__document-list' },
            visibleDocuments.length
              ? visibleDocuments.map((document) =>
                  createElement(
                    'article',
                    {
                      className: `draw-editor__document${document.id === activeDocument?.id ? ' draw-editor__document--active' : ''}`,
                      key: document.id,
                    },
                    createElement(
                      'button',
                      {
                        className: 'draw-editor__document-open',
                        type: 'button',
                        onClick: () => void setActive(document),
                      },
                      createElement('strong', null, document.title),
                      createElement(
                        'small',
                        null,
                        `更新于 ${formatUpdatedAt(document.updatedAt)} · ${formatBytes(document.size)}`,
                      ),
                    ),
                    createElement(
                      'div',
                      { className: 'draw-editor__document-actions' },
                      HeaderButton({
                        children: '重命名',
                        title: '重命名画板',
                        onClick: () => {
                          setRenameValue(document.title);
                          setDialog({ type: 'rename', document });
                        },
                      }),
                      HeaderButton({
                        children: '复制',
                        title: '复制画板',
                        onClick: () => void duplicateDocument(document),
                      }),
                      HeaderButton({
                        children: '导出',
                        title: '导出该画板',
                        onClick: () => exportStoredDocument(document),
                      }),
                      HeaderButton({
                        children: '删除',
                        title: '删除画板',
                        onClick: () => setDialog({ type: 'delete', document }),
                      }),
                    ),
                  ),
                )
              : createElement(
                  'p',
                  { className: 'draw-editor__empty-list' },
                  '没有匹配的本地画板。',
                ),
          ),
          createElement(
            'footer',
            null,
            createElement('span', null, `${documents.length} 个画板`),
            HeaderButton({
              children: '清空全部',
              title: '清空全部本地画板',
              onClick: () => setDialog({ type: 'clear' }),
            }),
          ),
        )
      : null,
    dialogContent,
  );
}

export function mountDrawEditor(element: HTMLElement, options: DrawEditorOptions): () => void {
  const root = createRoot(element);
  root.render(createElement(DrawEditor, options));
  return () => root.unmount();
}
