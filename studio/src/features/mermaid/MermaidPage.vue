<script setup lang="ts">
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChartDots3,
  IconBrush,
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconCode,
  IconCopy,
  IconDownload,
  IconFileImport,
  IconFilePlus,
  IconFileText,
  IconGrid4x4,
  IconHistory,
  IconMaximize,
  IconMinus,
  IconMoon,
  IconPalette,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShare,
  IconSun,
  IconX,
} from '@tabler/icons-vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api.js';
import { useRouter } from 'vue-router';
import { useTheme } from '@/composables/useTheme';
import '@/features/mermaid/mermaid.css';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import StudioLogo from '@/components/StudioLogo.vue';
import { sanitizeMermaidSvg } from '@/features/markdown/services/mermaid-security';
import { useFileHandoff } from '@/core/browser/file-handoff';
import { enqueueMermaidTask } from '@/core/mermaid/scheduler';
import { mermaidBackgroundPreviewActive } from '@/core/shared/route-state';
import {
  DEFAULT_MERMAID_CONFIG,
  DEFAULT_MERMAID_SOURCE,
  MERMAID_EXAMPLES,
  type MermaidExample,
} from '@/features/mermaid/examples';
import {
  DEFAULT_VISUAL_CONFIG,
  MERMAID_CURVE_OPTIONS,
  MERMAID_THEME_OPTIONS,
  parseMermaidConfig,
  renderConfigForTheme,
  serializeMermaidConfig,
  sourceHasInlineConfig,
  updateDocumentVisualConfig,
  visualConfigFromDocument,
  type MermaidVisualConfig,
} from '@/features/mermaid/services/config';
import { decodeMermaidShare, shareUrl } from '@/features/mermaid/services/share';
import {
  activeMermaidId,
  listMermaidDocuments,
  listMermaidHistory,
  normalizeMermaidDocument,
  saveActiveMermaidId,
  saveMermaidDocument,
  saveMermaidHistory,
} from '@/features/mermaid/services/storage';
import {
  mermaidDocumentJson,
  mermaidMarkdownText,
  mermaidMmdText,
  safeMermaidFilename,
} from '@/features/mermaid/services/export';
import type { MermaidDocument, MermaidPreviewState } from '@/features/mermaid/types';
import {
  MermaidEditingSession,
  type MermaidVisualRenderResult,
} from '@/features/mermaid/visual/MermaidEditingSession';

interface MonacoWorkerEnvironment {
  getWorker(moduleId: string, label: string): Worker;
}
type MermaidExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'pdf' | 'mmd' | 'markdown' | 'json';

type MonacoRuntime = typeof import('monaco-editor/editor/editor.api.js');

// monaco 本体与它的 worker 是 MB 级产物，静态 import 会把它们钉进 /mermaid 的首屏关键路径。
// 改成挂载前 await 一次：只有真正要建源码编辑器时才下载。
let monaco!: MonacoRuntime;
let monacoLoading: Promise<MonacoRuntime> | null = null;

function loadMonaco(): Promise<MonacoRuntime> {
  monacoLoading ??= (async () => {
    const [runtime, { default: EditorWorker }] = await Promise.all([
      import('monaco-editor/editor/editor.api.js'),
      import('monaco-editor/editor/editor.worker.js?worker'),
    ]);
    const monacoGlobal = globalThis as typeof globalThis & {
      MonacoEnvironment?: MonacoWorkerEnvironment;
    };
    monacoGlobal.MonacoEnvironment ??= { getWorker: () => new EditorWorker() };
    monaco = runtime;
    return runtime;
  })();
  return monacoLoading;
}

const router = useRouter();
const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();
const { takeHandoff } = useFileHandoff();
const source = ref(DEFAULT_MERMAID_SOURCE);
const configText = ref(DEFAULT_MERMAID_CONFIG);
const title = ref('未命名图表');
const documentId = ref<string>(crypto.randomUUID());
const createdAt = ref(Date.now());
const updatedAt = ref(Date.now());
const previewState = ref<MermaidPreviewState>('idle');
const previewError = ref('');
const errorLine = ref<number | null>(null);
const detectedType = ref('');
const activeTab = ref<'code' | 'config' | 'examples'>('code');
const mobilePane = ref<'editor' | 'preview'>('editor');
const openExampleCategory = ref<string | null>(null);
const historyOpen = ref(false);
const isDirty = ref(false);
const history = ref<MermaidDocument[]>([]);
const documents = ref<MermaidDocument[]>([]);
const exportOpen = ref(false);
const copyOpen = ref(false);
const importing = ref(false);
const gridEnabled = ref(true);
const sidebarWidth = ref(360);
const isResizingSidebar = ref(false);
const scale = ref(1);
const canvasElement = ref<HTMLElement | null>(null);
const sourceEditorMount = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const saveMessage = ref('');
const shareMessage = ref('');
const conflictDocument = ref<MermaidDocument | null>(null);
const isFullscreen = ref(false);
let sourceEditor: MonacoEditor.IStandaloneCodeEditor | null = null;
let sourceModel: MonacoEditor.ITextModel | null = null;
let saveTimer: number | undefined;
let saveQueue = Promise.resolve();
let editingSession: MermaidEditingSession | null = null;
let persistedDocumentId: string | null = null;
let persistedDocumentUpdatedAt: number | null = null;
let initialLoadComplete = false;
let dragDepth = 0;
let stopSidebarResize: (() => void) | null = null;
let mermaidChannel: BroadcastChannel | null = null;
let feedbackTimer: number | undefined;
let shareSnapshotActive = false;
const GRID_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('mermaid')}:grid`;
const SIDEBAR_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('mermaid')}:sidebar-width`;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 560;
const MAX_IMPORT_FILE_BYTES = 2_000_000;
const MAX_IMPORT_TEXT_LENGTH = 1_000_000;
const MERMAID_IMPORT_EXTENSIONS = new Set(['mmd', 'mermaid', 'md', 'markdown', 'json']);

const groupedExamples = computed(() =>
  MERMAID_EXAMPLES.reduce<Record<string, MermaidExample[]>>((groups, example) => {
    (groups[example.category] ??= []).push(example);
    return groups;
  }, {}),
);
const EXAMPLE_CATEGORY_ORDER = [
  '流程图',
  '类图',
  '时序图',
  '实体关系图',
  '思维导图',
  '架构图',
  '块图',
  'C4',
  'Cynefin 框架',
  '事件建模',
  '甘特图',
  'Git 图',
  '鱼骨图',
  '看板',
  '数据包图',
  '饼图',
  '象限图',
  '雷达图',
  '铁路图 (ABNF)',
  '铁路图 (EBNF)',
  '铁路图 (IR)',
  '铁路图 (PEG)',
  '需求图',
  '桑基图',
  '时间线',
  '树视图',
  '树状图',
  '用户旅程',
  '维恩图',
  'Wardley 地图',
  'XY 图',
];
const exampleCategoryGroups = computed(() => {
  const order = new Map(EXAMPLE_CATEGORY_ORDER.map((category, index) => [category, index]));
  return Object.entries(groupedExamples.value)
    .map(([category, items]) => ({
      category,
      items,
      primary: items.find((item) => item.isDefault) ?? items[0]!,
    }))
    .sort((left, right) => {
      const leftIndex = order.get(left.category) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = order.get(right.category) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.category.localeCompare(right.category, 'zh-CN');
    });
});
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
const parsedConfig = computed(() => parseMermaidConfig(configText.value));
const visualConfig = computed<MermaidVisualConfig>(() =>
  parsedConfig.value.error
    ? DEFAULT_VISUAL_CONFIG
    : visualConfigFromDocument(parsedConfig.value.value),
);
const inlineConfigWarning = computed(() => sourceHasInlineConfig(source.value));
const canExport = computed(
  () =>
    previewState.value === 'success' && Boolean(source.value.trim()) && !parsedConfig.value.error,
);
const defaultConfigValue = parseMermaidConfig(DEFAULT_MERMAID_CONFIG).value;
const isDefaultConfig = computed(
  () => JSON.stringify(parsedConfig.value.value) === JSON.stringify(defaultConfigValue),
);

function registerMermaidLanguage(): void {
  if (monaco.languages.getLanguages().some(({ id }) => id === 'mermaid')) return;
  monaco.languages.register({ id: 'mermaid' });
  monaco.languages.setMonarchTokensProvider('mermaid', {
    tokenizer: {
      root: [
        [
          /^(---|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|gitGraph|journey|quadrantChart|xychart(?:-beta)?|sankey(?:-beta)?|architecture(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?|treeView(?:-beta)?|requirement(?:Diagram)?|C4(?:Context|Container|Component|Dynamic|Deployment)|venn(?:-beta)?|wardley(?:-beta)?|cynefin(?:-beta)?|ishikawa(?:-beta)?|railroad(?:-(?:ir|ebnf|abnf|peg)-beta)?|kanban)\b/,
          'keyword',
        ],
        [/\b(subgraph|end|section|participant|title|dateFormat|class|style|click)\b/, 'keyword'],
        [/-->|->>|==>|-\.->|--|::|:/, 'operator'],
        [/\b\d+(?:\.\d+)?\b/, 'number'],
        [/%%.*$/, 'comment'],
        [/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/, 'string'],
      ],
    },
  });
}
function registerThemes(): void {
  monaco.editor.defineTheme('mermaid-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '9f0035', fontStyle: 'bold' },
      { token: 'operator', foreground: '0f766e' },
      { token: 'comment', foreground: '64748b' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#ffffff',
      'editor.lineHighlightBackground': '#f7f8fa',
    },
  });
  monaco.editor.defineTheme('mermaid-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'ff7aa4', fontStyle: 'bold' },
      { token: 'operator', foreground: '5eead4' },
      { token: 'comment', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#141820',
      'editorGutter.background': '#141820',
      'editor.lineHighlightBackground': '#1b2230',
    },
  });
  monaco.editor.defineTheme('mermaid-light-background-preview', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '9f0035', fontStyle: 'bold' },
      { token: 'operator', foreground: '0f766e' },
      { token: 'comment', foreground: '64748b' },
    ],
    colors: {
      'editor.background': '#ffffff00',
      'editorGutter.background': '#ffffff00',
      'editor.lineHighlightBackground': '#ffffff24',
    },
  });
  monaco.editor.defineTheme('mermaid-dark-background-preview', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'ff7aa4', fontStyle: 'bold' },
      { token: 'operator', foreground: '5eead4' },
      { token: 'comment', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#14182000',
      'editorGutter.background': '#14182000',
      'editor.lineHighlightBackground': '#00000030',
    },
  });
}
function editorTheme(): string {
  if (mermaidBackgroundPreviewActive.value) {
    return resolvedTheme.value === 'dark'
      ? 'mermaid-dark-background-preview'
      : 'mermaid-light-background-preview';
  }
  return resolvedTheme.value === 'dark' ? 'mermaid-dark' : 'mermaid-light';
}
function editorOptions(): MonacoEditor.IStandaloneEditorConstructionOptions {
  return {
    language: 'mermaid',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    padding: { top: 14, bottom: 18 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    wordWrap: 'on',
    tabSize: 2,
    theme: editorTheme(),
    renderLineHighlight: 'line',
    bracketPairColorization: { enabled: true },
    folding: true,
    stickyScroll: { enabled: false },
    ariaLabel: 'Mermaid 源码编辑器',
    readOnly: false,
  };
}
async function mountEditors(): Promise<void> {
  if (!sourceEditorMount.value) return;
  await loadMonaco();
  // 加载期间组件可能已卸载，此时模板 ref 已被置空，不能往脱离文档的节点上建编辑器。
  if (!sourceEditorMount.value) return;
  registerMermaidLanguage();
  registerThemes();
  sourceModel = monaco.editor.createModel(
    source.value,
    'mermaid',
    monaco.Uri.parse(`inmemory://mermaid/${documentId.value}.mmd`),
  );
  sourceEditor = monaco.editor.create(sourceEditorMount.value, {
    ...editorOptions(),
    model: sourceModel,
  });
}
function setSourceMarker(message = '', line: number | null = null): void {
  if (!sourceModel) return;
  const markerLine = line ? Math.min(Math.max(1, line), sourceModel.getLineCount()) : null;
  monaco.editor.setModelMarkers(
    sourceModel,
    'mermaid-render',
    message && markerLine
      ? [
          {
            startLineNumber: markerLine,
            startColumn: 1,
            endLineNumber: markerLine,
            endColumn: Math.max(2, sourceModel.getLineMaxColumn(markerLine)),
            message,
            severity: monaco.MarkerSeverity.Error,
          },
        ]
      : [],
  );
}
function applyVisualConfig(patch: Partial<MermaidVisualConfig>): void {
  if (parsedConfig.value.error) return;
  const next = updateDocumentVisualConfig(parsedConfig.value.value, patch);
  configText.value = serializeMermaidConfig(next);
  changed();
  syncVisualConfig();
}
function resetConfig(): void {
  configText.value = DEFAULT_MERMAID_CONFIG;
  changed();
  syncVisualConfig();
}
function toggleGrid(): void {
  gridEnabled.value = !gridEnabled.value;
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(GRID_PREFERENCE_KEY, String(gridEnabled.value));
  } catch {
    // 本地偏好不可用不影响当前画布。
  }
}
function clampSidebarWidth(value: number): number {
  const viewportLimit = Math.max(SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth * 0.56));
  return Math.min(SIDEBAR_MAX_WIDTH, viewportLimit, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}
function saveSidebarWidthPreference(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(sidebarWidth.value));
  } catch {
    // 本地偏好不可用不影响当前分栏宽度。
  }
}
function startSidebarResize(event: PointerEvent): void {
  if (window.innerWidth <= 760 || event.button !== 0) return;
  stopSidebarResize?.();
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;
  isResizingSidebar.value = true;
  let active = true;
  const move = (moveEvent: PointerEvent) => {
    sidebarWidth.value = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
    sourceEditor?.layout();
  };
  const end = () => {
    if (!active) return;
    active = false;
    isResizingSidebar.value = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    saveSidebarWidthPreference();
    sourceEditor?.layout();
    stopSidebarResize = null;
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  stopSidebarResize = end;
}
function handleSidebarResizeKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  sidebarWidth.value = clampSidebarWidth(
    sidebarWidth.value + (event.key === 'ArrowRight' ? 16 : -16),
  );
  saveSidebarWidthPreference();
  sourceEditor?.layout();
}
function changed(): void {
  isDirty.value = true;
  if (shareSnapshotActive) {
    shareSnapshotActive = false;
    void router.replace({ hash: '' });
  }
  updatedAt.value = Math.max(Date.now(), updatedAt.value + 1);
  saveState.value = 'idle';
  if (source.value.trim()) previewState.value = 'loading';
  else {
    previewState.value = 'idle';
    previewError.value = '请输入 Mermaid 源码。';
    setSourceMarker();
  }
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveDocument(true), 800);
}
function currentDocumentSnapshot(): MermaidDocument {
  return {
    schemaVersion: 1,
    id: documentId.value,
    title: (title.value.trim() || '未命名图表').slice(0, 120),
    source: source.value,
    configText: configText.value,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
  };
}
function hasPendingDocumentChanges(): boolean {
  return persistedDocumentId !== documentId.value || persistedDocumentUpdatedAt !== updatedAt.value;
}
function cancelPendingSaveTimer(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = undefined;
}
function persistBeforeDocumentSwitch(): void {
  cancelPendingSaveTimer();
  if (!initialLoadComplete || !hasPendingDocumentChanges()) return;
  void saveDocument(false);
}
function broadcastSavedDocument(document: MermaidDocument): void {
  mermaidChannel?.postMessage({ type: 'mermaid-document-saved', document });
}
function startConflictChannel(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  mermaidChannel = new BroadcastChannel('meowv-studio-mermaid');
  mermaidChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const payload = event.data as { type?: unknown; document?: unknown } | null;
    const incoming = normalizeMermaidDocument(payload?.document);
    const current = currentDocumentSnapshot();
    if (
      payload?.type !== 'mermaid-document-saved' ||
      !incoming ||
      incoming.id !== documentId.value ||
      incoming.updatedAt < updatedAt.value ||
      (incoming.source === current.source &&
        incoming.configText === current.configText &&
        incoming.title === current.title)
    )
      return;
    if (conflictDocument.value && incoming.updatedAt <= conflictDocument.value.updatedAt) return;
    conflictDocument.value = incoming;
    historyOpen.value = true;
  });
}
function acceptConflictDocument(): void {
  const incoming = conflictDocument.value;
  if (!incoming) return;
  loadDocument(incoming, false);
  conflictDocument.value = null;
  shareMessage.value = '已载入其他标签页的版本。';
}
function keepLocalDocument(): void {
  conflictDocument.value = null;
  void saveDocument(false, true);
}
function currentRenderConfig() {
  return renderConfigForTheme(parsedConfig.value.value, resolvedTheme.value);
}
function handleSessionCodeChange(code: string): void {
  if (source.value === code) return;
  source.value = code;
  changed();
}
function handleSessionRender(result: MermaidVisualRenderResult): void {
  if (result.empty) {
    previewState.value = 'idle';
    previewError.value = '请输入 Mermaid 源码。';
    detectedType.value = '';
    errorLine.value = null;
    setSourceMarker();
    return;
  }
  if (result.ok) {
    previewState.value = 'success';
    previewError.value = '';
    detectedType.value = editingSession?.diagramType ?? '';
    errorLine.value = null;
    setSourceMarker();
    return;
  }
  previewState.value = 'error';
  previewError.value = result.error.replace(/\s+/gu, ' ').slice(0, 320) || 'Mermaid 语法无法解析。';
  const match = result.error.match(/line\s+(\d+)/iu);
  errorLine.value = match ? Number(match[1]) : null;
  setSourceMarker(previewError.value, errorLine.value);
}
async function mountVisualSession(): Promise<void> {
  if (!canvasElement.value || !sourceEditor || editingSession) return;
  previewState.value = 'loading';
  const session = new MermaidEditingSession({
    code: source.value,
    config: currentRenderConfig(),
    container: canvasElement.value,
    monacoEditor: sourceEditor,
    onCodeChange: handleSessionCodeChange,
    onRender: handleSessionRender,
    onViewportScale: (nextScale) => {
      scale.value = nextScale;
    },
  });
  editingSession = session;
  try {
    await session.mount();
  } catch (error) {
    session.dispose();
    if (editingSession === session) editingSession = null;
    previewState.value = 'engine-error';
    previewError.value = error instanceof Error ? error.message : '可视化编辑器加载失败。';
  }
}
async function rebuildVisualSession(): Promise<void> {
  if (!editingSession) return;
  previewState.value = source.value.trim() ? 'loading' : 'idle';
  previewError.value = source.value.trim() ? '' : '请输入 Mermaid 源码。';
  try {
    await editingSession.setDocument(source.value, currentRenderConfig());
  } catch (error) {
    previewState.value = 'engine-error';
    previewError.value = error instanceof Error ? error.message : '可视化编辑器加载失败。';
  }
}
function syncVisualConfig(): void {
  if (parsedConfig.value.error) return;
  editingSession?.setConfig(currentRenderConfig());
}
async function render(): Promise<void> {
  if (!editingSession) {
    await mountVisualSession();
    return;
  }
  await editingSession.render();
}
function isCurrentDocumentSnapshot(document: MermaidDocument): boolean {
  const current = currentDocumentSnapshot();
  return (
    document.id === current.id &&
    document.title === current.title &&
    document.source === current.source &&
    document.configText === current.configText &&
    document.createdAt === current.createdAt &&
    document.updatedAt === current.updatedAt
  );
}
async function saveDocument(isAuto = false, forceLocal = false): Promise<void> {
  if (conflictDocument.value && !forceLocal) return;
  const document = currentDocumentSnapshot();
  saveState.value = 'saving';
  saveMessage.value = '';
  const operation = saveQueue
    .catch(() => undefined)
    .then(async () => {
      if (conflictDocument.value) {
        if (isCurrentDocumentSnapshot(document)) {
          saveState.value = 'idle';
          saveMessage.value = '';
        }
        return;
      }
      if (!isCurrentDocumentSnapshot(document)) return;
      let ok = false;
      try {
        ok = await saveMermaidDocument(document);
      } catch {
        ok = false;
      }
      // 队列按提交顺序写入，且只有仍对应当前文档的快照才能更新界面状态。
      if (!isCurrentDocumentSnapshot(document)) return;
      if (ok) {
        persistedDocumentId = document.id;
        persistedDocumentUpdatedAt = document.updatedAt;
        saveMermaidHistory(document);
        saveActiveMermaidId(document.id);
        saveState.value = 'saved';
        isDirty.value = false;
        saveMessage.value = isAuto ? '已自动保存到此浏览器' : '已保存到此浏览器';
        documents.value = [document, ...documents.value.filter((item) => item.id !== document.id)];
        history.value = listMermaidHistory();
        broadcastSavedDocument(document);
      } else {
        saveState.value = 'error';
        saveMessage.value = '浏览器存储不可用，请导出图表文档备份。';
      }
    });
  saveQueue = operation.catch(() => undefined);
  await operation.catch(() => undefined);
}
function newDocument(): void {
  if (shareSnapshotActive) {
    shareSnapshotActive = false;
    void router.replace({ hash: '' });
  }
  conflictDocument.value = null;
  persistBeforeDocumentSwitch();
  source.value = DEFAULT_MERMAID_SOURCE;
  configText.value = DEFAULT_MERMAID_CONFIG;
  title.value = '未命名图表';
  documentId.value = crypto.randomUUID();
  createdAt.value = Date.now();
  updatedAt.value = createdAt.value;
  persistedDocumentId = null;
  persistedDocumentUpdatedAt = null;
  isDirty.value = false;
  saveState.value = 'idle';
  saveMessage.value = '';
  void rebuildVisualSession();
}
function loadDocument(document: MermaidDocument, persistCurrent = true): void {
  conflictDocument.value = null;
  if (shareSnapshotActive) {
    shareSnapshotActive = false;
    void router.replace({ hash: '' });
  }
  if (persistCurrent) persistBeforeDocumentSwitch();
  else cancelPendingSaveTimer();
  documentId.value = document.id;
  title.value = document.title;
  source.value = document.source;
  configText.value = document.configText || DEFAULT_MERMAID_CONFIG;
  createdAt.value = document.createdAt;
  updatedAt.value = document.updatedAt;
  persistedDocumentId = document.id;
  persistedDocumentUpdatedAt = updatedAt.value;
  isDirty.value = false;
  saveState.value = 'idle';
  saveMessage.value = '';
  void rebuildVisualSession();
}
function loadHistorySnapshot(snapshot: MermaidDocument): void {
  saveMermaidHistory(currentDocumentSnapshot());
  loadDocument({ ...snapshot, updatedAt: Date.now() });
  void saveDocument(false);
  history.value = listMermaidHistory();
  historyOpen.value = false;
  shareMessage.value = '已恢复历史版本，当前内容可继续编辑。';
}
function loadExample(example: MermaidExample): void {
  if (example.available === false) {
    shareMessage.value = `${example.title}暂不可用：${example.requires ?? '当前引擎未注册该扩展'}。`;
    return;
  }
  if (isDirty.value && !window.confirm('载入示例会替换当前源码，是否继续？')) return;
  source.value = example.source;
  title.value = example.title;
  configText.value = example.configText || DEFAULT_MERMAID_CONFIG;
  changed();
  // 载入示例本身不是用户编辑，后续切换示例无需重复确认。
  isDirty.value = false;
  void rebuildVisualSession();
  mobilePane.value = 'preview';
  openExampleCategory.value = null;
}
function toggleExampleCategory(category: string): void {
  openExampleCategory.value = openExampleCategory.value === category ? null : category;
}
function handleViewportResize(): void {
  sidebarWidth.value = clampSidebarWidth(sidebarWidth.value);
  sourceEditor?.layout();
}
function undo(): void {
  editingSession?.undo();
}
function redo(): void {
  editingSession?.redo();
}
function fitView(): boolean {
  editingSession?.fitView();
  return Boolean(editingSession);
}
function zoom(delta: number): void {
  editingSession?.zoomBy(delta > 0 ? 1.1 : 1 / 1.1);
}
function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  zoom(event.deltaY > 0 ? -0.1 : 0.1);
}
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
function prepareSvgForRasterization(svg: string): string {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return svg;
  try {
    const parsedDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = parsedDocument.documentElement;
    if (root.localName.toLowerCase() !== 'svg') return svg;
    const viewBox = root.getAttribute('viewBox')?.trim().split(/\s+/u).map(Number) ?? [];
    if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value))) {
      const width = Math.abs(viewBox[2]);
      const height = Math.abs(viewBox[3]);
      if (width > 0 && height > 0) {
        const currentWidth = root.getAttribute('width') ?? '';
        const currentHeight = root.getAttribute('height') ?? '';
        if (!currentWidth || /%$/u.test(currentWidth)) root.setAttribute('width', String(width));
        if (!currentHeight || /%$/u.test(currentHeight))
          root.setAttribute('height', String(height));
      }
    }
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return new XMLSerializer().serializeToString(root);
  } catch {
    return svg;
  }
}
function svgDimensions(svg: string): { width: number; height: number } {
  if (typeof DOMParser !== 'undefined') {
    try {
      const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
      const viewBox = root.getAttribute('viewBox')?.trim().split(/\s+/u).map(Number) ?? [];
      const widthAttribute = root.getAttribute('width') ?? '';
      const heightAttribute = root.getAttribute('height') ?? '';
      const width = /%$/u.test(widthAttribute) ? Number.NaN : Number.parseFloat(widthAttribute);
      const height = /%$/u.test(heightAttribute) ? Number.NaN : Number.parseFloat(heightAttribute);
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)
        return { width, height };
      if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0)
        return { width: viewBox[2], height: viewBox[3] };
    } catch {
      // 使用保守默认尺寸。
    }
  }
  return { width: 800, height: 600 };
}
function rasterizePreview(
  mime: 'image/png' | 'image/jpeg' | 'image/webp',
  svgSource: string,
): Promise<Blob | null> {
  if (!svgSource) return Promise.resolve(null);
  return new Promise((resolve) => {
    const rasterSvg = prepareSvgForRasterization(svgSource);
    const url = URL.createObjectURL(new Blob([rasterSvg], { type: 'image/svg+xml' }));
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    image.onerror = () => {
      cleanup();
      resolve(null);
    };
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        cleanup();
        resolve(null);
        return;
      }
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const maxPixels = 16_000_000;
      const maxDimension = 8192;
      const pixelRatio = Math.min(
        ratio,
        maxDimension / sourceWidth,
        maxDimension / sourceHeight,
        Math.sqrt(maxPixels / (sourceWidth * sourceHeight)),
      );
      const width = Math.max(1, Math.floor(sourceWidth * pixelRatio));
      const height = Math.max(1, Math.floor(sourceHeight * pixelRatio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        cleanup();
        resolve(null);
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      cleanup();
      try {
        canvas.toBlob((blob) => resolve(blob), mime, mime === 'image/jpeg' ? 0.94 : undefined);
      } catch {
        resolve(null);
      }
    };
    image.src = url;
  });
}
async function renderExportSvg(): Promise<string | null> {
  const parsed = parseMermaidConfig(configText.value);
  if (parsed.error || !source.value.trim()) return null;
  return enqueueMermaidTask(async () => {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      ...renderConfigForTheme(parsed.value, resolvedTheme.value),
      htmlLabels: false,
    });
    const result = await mermaid.render(`mermaid-export-${Date.now()}`, source.value.trim());
    return sanitizeMermaidSvg(result.svg);
  }).catch(() => null);
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('file-read-failed'));
    reader.readAsDataURL(blob);
  });
}
function scheduleFeedbackClear(): void {
  if (feedbackTimer) window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    shareMessage.value = '';
    feedbackTimer = undefined;
  }, 2400);
}
function extractMarkdownConfig(text: string): string | null {
  const match = text.match(/<!--\s*meowv-studio-config\s*\n([\s\S]*?)\n-->/iu);
  return match?.[1]?.trim() || null;
}
function extractMmdConfig(text: string): { source: string; configText: string | null } {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^\s*%%\s*meowv-studio-config\s*$/iu.test(line));
  if (start < 0) return { source: text, configText: null };
  const end = lines.findIndex(
    (line, index) => index > start && /^\s*%%\s*meowv-studio-config-end\s*$/iu.test(line),
  );
  if (end < 0) return { source: text, configText: null };
  const configText = lines
    .slice(start + 1, end)
    .map((line) => line.replace(/^\s*%% ?/u, ''))
    .join('\n')
    .trim();
  return {
    source: [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n').trim(),
    configText: configText || null,
  };
}
async function copyPng(): Promise<void> {
  if (!canExport.value) {
    shareMessage.value = '请先成功渲染图表。';
    return;
  }
  const exportSvg = await renderExportSvg();
  if (!exportSvg) {
    shareMessage.value = 'PNG 生成失败，请重试。';
    return;
  }
  const blob = await rasterizePreview('image/png', exportSvg);
  if (!blob) {
    shareMessage.value = 'PNG 生成失败，请重试。';
    return;
  }
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
      throw new Error('unsupported');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    shareMessage.value = 'PNG 已复制到剪贴板';
  } catch {
    downloadBlob(blob, `${safeMermaidFilename(title.value)}.png`);
    shareMessage.value = '浏览器不允许复制图片，已下载 PNG 备用';
  }
}
async function copyDiagram(kind: 'source' | 'png'): Promise<void> {
  if (kind === 'source') {
    await copyText(source.value);
    return;
  }
  await copyPng();
}
async function exportFile(format: MermaidExportFormat): Promise<void> {
  exportOpen.value = false;
  if (!canExport.value && ['svg', 'png', 'jpg', 'webp', 'pdf'].includes(format)) {
    shareMessage.value = '请先成功渲染图表。';
    return;
  }
  const safeName = safeMermaidFilename(title.value);
  if (format === 'svg') {
    const exportSvg = await renderExportSvg();
    if (!exportSvg) {
      shareMessage.value = 'SVG 生成失败，请重试。';
      return;
    }
    downloadBlob(new Blob([exportSvg], { type: 'image/svg+xml;charset=utf-8' }), `${safeName}.svg`);
    return;
  }
  if (format === 'mmd') {
    downloadBlob(
      new Blob([mermaidMmdText(source.value, configText.value)], {
        type: 'text/plain;charset=utf-8',
      }),
      `${safeName}.mmd`,
    );
    return;
  }
  if (format === 'markdown') {
    downloadBlob(
      new Blob([mermaidMarkdownText(source.value, configText.value)], {
        type: 'text/markdown;charset=utf-8',
      }),
      `${safeName}.md`,
    );
    return;
  }
  if (format === 'json') {
    const document: MermaidDocument = {
      schemaVersion: 1,
      id: documentId.value,
      title: title.value,
      source: source.value,
      configText: configText.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
    };
    downloadBlob(
      new Blob([mermaidDocumentJson(document)], { type: 'application/json;charset=utf-8' }),
      `${safeName}.mermaid.json`,
    );
    return;
  }
  if (format === 'png' || format === 'jpg' || format === 'webp') {
    const mime = format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp';
    const exportSvg = await renderExportSvg();
    if (!exportSvg) {
      shareMessage.value = '图片生成失败，请重试。';
      return;
    }
    const blob = await rasterizePreview(mime, exportSvg);
    if (!blob) {
      shareMessage.value = '图片生成失败，请重试。';
      return;
    }
    downloadBlob(blob, `${safeName}.${format}`);
    return;
  }
  const exportSvg = await renderExportSvg();
  if (!exportSvg) {
    shareMessage.value = 'PDF 生成失败：图表无法转换为图片。';
    return;
  }
  const blob = await rasterizePreview('image/png', exportSvg);
  if (!blob) {
    shareMessage.value = 'PDF 生成失败：图表无法转换为图片。';
    return;
  }
  const svg = prepareSvgForRasterization(exportSvg);
  const { width, height } = svgDimensions(svg);
  try {
    const { jsPDF } = await import('jspdf');
    const imageData = await blobToDataUrl(blob);
    if (!imageData) throw new Error('empty-image');
    const pdf = new jsPDF({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
    });
    pdf.addImage(imageData, 'PNG', 0, 0, width, height);
    pdf.save(`${safeName}.pdf`);
  } catch {
    shareMessage.value = 'PDF 生成失败：无法写入 PDF。';
  }
}
async function copyText(value: string, fallback = value): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    shareMessage.value = '已复制到剪贴板';
  } catch {
    if (fallback)
      downloadBlob(
        new Blob([fallback], { type: 'text/plain;charset=utf-8' }),
        'mermaid-clipboard.txt',
      );
    shareMessage.value = '剪贴板不可用，已提供下载备用';
  }
}
async function copyShareLink(): Promise<void> {
  try {
    const url = shareUrl({
      protocol: 1,
      title: title.value,
      source: source.value,
      configText: configText.value,
    });
    await copyText(url);
    scheduleFeedbackClear();
  } catch (error) {
    shareMessage.value = error instanceof Error ? error.message : '分享链接生成失败。';
  }
}
function openImport(): void {
  fileInput.value?.click();
}
function validateImportedConfig(config: string): void {
  if (!config.trim()) return;
  const parsed = parseMermaidConfig(config);
  if (parsed.error) throw new Error('导入的图表配置不是有效 JSON。');
}
async function importFile(file: File): Promise<void> {
  importing.value = true;
  try {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    if (!MERMAID_IMPORT_EXTENSIONS.has(extension)) {
      throw new Error('仅支持导入 .mmd、.mermaid、Markdown 或 Mermaid 图表文档。');
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new Error('导入文件过大，请控制在 2 MB 以内。');
    }
    const text = await file.text();
    if (text.length > MAX_IMPORT_TEXT_LENGTH) throw new Error('导入文件内容过大。');
    if (extension === 'json') {
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('不是有效的 Mermaid 图表文档。');
      const candidate = value as Partial<MermaidDocument>;
      if (
        candidate.schemaVersion !== 1 ||
        typeof candidate.source !== 'string' ||
        candidate.source.length > 200_000 ||
        typeof candidate.configText !== 'string' ||
        candidate.configText.length > 120_000 ||
        (candidate.title !== undefined && typeof candidate.title !== 'string') ||
        (candidate.id !== undefined &&
          (typeof candidate.id !== 'string' || !candidate.id || candidate.id.length > 200)) ||
        (candidate.createdAt !== undefined && !Number.isFinite(candidate.createdAt)) ||
        (candidate.updatedAt !== undefined && !Number.isFinite(candidate.updatedAt))
      )
        throw new Error('不是有效的 Mermaid 图表文档。');
      const doc = candidate as MermaidDocument;
      validateImportedConfig(doc.configText);
      loadDocument({
        schemaVersion: 1,
        id: typeof doc.id === 'string' && doc.id ? doc.id : crypto.randomUUID(),
        title: doc.title?.slice(0, 120) || file.name,
        source: doc.source,
        configText: doc.configText || DEFAULT_MERMAID_CONFIG,
        createdAt: Number.isFinite(doc.createdAt) ? doc.createdAt : Date.now(),
        updatedAt: Number.isFinite(doc.updatedAt) ? doc.updatedAt : Date.now(),
      });
    } else if (extension === 'md' || extension === 'markdown') {
      const matches = [...text.matchAll(/```mermaid\s*\n([\s\S]*?)```/giu)];
      const blocks = matches.map((match) => match[1].trim());
      if (!blocks.length) throw new Error('没有找到 Mermaid 代码块。');
      const selectedIndex =
        blocks.length === 1
          ? 0
          : Number(
              window.prompt(
                `文件包含 ${blocks.length} 个 Mermaid 代码块，请输入要导入的序号（1-${blocks.length}）：`,
                '1',
              ),
            ) - 1;
      if (!Number.isInteger(selectedIndex) || !blocks[selectedIndex])
        throw new Error('未选择有效的 Mermaid 代码块。');
      const blockStart = matches[selectedIndex]?.index ?? 0;
      const embeddedConfig = extractMarkdownConfig(text.slice(0, blockStart));
      if (embeddedConfig) validateImportedConfig(embeddedConfig);
      persistBeforeDocumentSwitch();
      source.value = blocks[selectedIndex];
      configText.value = embeddedConfig || DEFAULT_MERMAID_CONFIG;
      title.value = file.name.replace(/\.[^.]+$/u, '');
      changed();
      void rebuildVisualSession();
    } else if (extension === 'mmd' || extension === 'mermaid') {
      const embedded = extractMmdConfig(text);
      if (embedded.configText) validateImportedConfig(embedded.configText);
      persistBeforeDocumentSwitch();
      source.value = embedded.source
        .replace(/^\s*```mermaid\s*\n/iu, '')
        .replace(/\n```\s*$/u, '')
        .trim();
      configText.value = embedded.configText || DEFAULT_MERMAID_CONFIG;
      title.value = file.name.replace(/\.[^.]+$/u, '');
      changed();
      void rebuildVisualSession();
    } else {
      throw new Error('不支持的 Mermaid 文件类型。');
    }
    mobilePane.value = 'preview';
  } catch (error) {
    shareMessage.value = error instanceof Error ? error.message : '导入失败。';
  } finally {
    importing.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
async function handleFileChange(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await importFile(file);
}
function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragDepth = 0;
  const file = event.dataTransfer?.files?.[0];
  if (file) void importFile(file);
}
function handleDragEnter(event: DragEvent): void {
  event.preventDefault();
  dragDepth += 1;
}
function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
}
async function loadInitial(): Promise<void> {
  const hash = window.location.hash.slice(1);
  if (hash) {
    try {
      const snapshot = decodeMermaidShare(hash);
      source.value = snapshot.source;
      configText.value = snapshot.configText;
      title.value = snapshot.title || '分享图表';
      persistedDocumentId = documentId.value;
      persistedDocumentUpdatedAt = updatedAt.value;
      shareSnapshotActive = true;
    } catch {
      shareMessage.value = '分享链接已损坏或过期，已保留本地草稿。';
    }
  }

  // A shared snapshot is an external document.  Keep it visible while still
  // loading local recent/history lists, without replacing the snapshot with
  // the local active document.
  if (shareSnapshotActive) {
    documents.value = await listMermaidDocuments();
    history.value = listMermaidHistory();
    return;
  }
  const handoff = takeHandoff('mermaid');
  if (handoff) {
    await importFile(handoff.file);
    return;
  }
  documents.value = await listMermaidDocuments();
  history.value = listMermaidHistory();
  const id = activeMermaidId();
  const active = documents.value.find((item) => item.id === id) ?? documents.value[0];
  if (active) loadDocument(active);
}
function toggleFullscreen(): void {
  const target = document.querySelector<HTMLElement>('.mermaid-workbench');
  if (!document.fullscreenElement) {
    const request = target?.requestFullscreen?.();
    if (request) void request.catch(() => (isFullscreen.value = false));
  } else {
    void document.exitFullscreen().catch(() => undefined);
  }
}
function syncFullscreenState(): void {
  isFullscreen.value = Boolean(document.fullscreenElement);
}
function closeMenus(event: PointerEvent): void {
  const element = event.target as Element;
  if (!element.closest('.mermaid-menu')) {
    exportOpen.value = false;
    copyOpen.value = false;
  }
  if (!element.closest('.mermaid-example-picker')) openExampleCategory.value = null;
}
watch(resolvedTheme, () => {
  if (sourceEditor) monaco.editor.setTheme(editorTheme());
  if (initialLoadComplete) syncVisualConfig();
});
watch(mermaidBackgroundPreviewActive, () => {
  if (sourceEditor) monaco.editor.setTheme(editorTheme());
});
watch(activeTab, async (tab) => {
  await nextTick();
  if (tab === 'code') sourceEditor?.layout();
});
watch(mobilePane, async (pane) => {
  await nextTick();
  if (pane === 'preview') editingSession?.fitView();
  else sourceEditor?.layout();
});
onMounted(async () => {
  document.addEventListener('pointerdown', closeMenus);
  document.addEventListener('fullscreenchange', syncFullscreenState);
  window.addEventListener('resize', handleViewportResize, { passive: true });
  startConflictChannel();
  if (storageAvailable()) {
    try {
      const storedGrid = localStorage.getItem(GRID_PREFERENCE_KEY);
      if (storedGrid !== null) gridEnabled.value = storedGrid !== 'false';
      const storedSidebarWidth = Number(localStorage.getItem(SIDEBAR_PREFERENCE_KEY));
      if (Number.isFinite(storedSidebarWidth))
        sidebarWidth.value = clampSidebarWidth(storedSidebarWidth);
    } catch {
      // 本地偏好不可用时使用默认网格。
    }
  }
  await loadInitial();
  await nextTick();
  await mountEditors();
  initialLoadComplete = true;
  await mountVisualSession();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenus);
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  window.removeEventListener('resize', handleViewportResize);
  if (feedbackTimer) clearTimeout(feedbackTimer);
  cancelPendingSaveTimer();
  if (initialLoadComplete && hasPendingDocumentChanges()) {
    void saveDocument(false);
  }
  editingSession?.dispose();
  editingSession = null;
  stopSidebarResize?.();
  stopSidebarResize = null;
  mermaidChannel?.close();
  mermaidChannel = null;
  sourceEditor?.dispose();
  sourceModel?.dispose();
});
</script>

<template>
  <section
    class="mermaid-workbench"
    :class="{ 'is-fullscreen': isFullscreen }"
    @dragenter="handleDragEnter"
    @dragover.prevent
    @dragleave="handleDragLeave"
    @drop="onDrop"
  >
    <header class="mermaid-toolbar">
      <div class="mermaid-toolbar__brand">
        <StudioLogo class="mermaid-toolbar__home" />
        <strong class="mermaid-toolbar__name">Mermaid</strong>
      </div>
      <input
        v-model="title"
        class="mermaid-title"
        maxlength="120"
        aria-label="图表名称"
        @change="changed()"
      />
      <div class="mermaid-toolbar__actions">
        <button
          class="mermaid-icon-button mermaid-action--new"
          type="button"
          title="新建"
          aria-label="新建图表"
          @click="newDocument"
        >
          <IconFilePlus :size="18" />
        </button>
        <button
          class="mermaid-icon-button mermaid-action--import"
          type="button"
          title="导入 .mmd / Markdown / 图表文档"
          aria-label="导入图表"
          :disabled="importing"
          @click="openImport"
        >
          <IconFileImport :size="18" />
        </button>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept=".mmd,.mermaid,.md,.markdown,.json"
          @change="handleFileChange"
        />
        <button
          class="mermaid-icon-button mermaid-action--undo"
          type="button"
          title="撤销"
          aria-label="撤销"
          @click="undo"
        >
          <IconArrowBackUp :size="18" />
        </button>
        <button
          class="mermaid-icon-button mermaid-action--redo"
          type="button"
          title="重做"
          aria-label="重做"
          @click="redo"
        >
          <IconArrowForwardUp :size="18" />
        </button>
        <div class="mermaid-menu">
          <button
            class="mermaid-icon-button"
            type="button"
            title="复制"
            aria-label="复制"
            :aria-expanded="copyOpen"
            @click.stop="copyOpen = !copyOpen"
          >
            <IconCopy :size="18" />
          </button>
          <div v-if="copyOpen" class="mermaid-menu__panel">
            <button
              type="button"
              title="复制源码"
              @click="
                copyDiagram('source');
                copyOpen = false;
              "
            >
              <IconCode :size="16" />复制源码
            </button>
            <button
              type="button"
              title="复制 PNG"
              :disabled="!canExport"
              @click="
                copyDiagram('png');
                copyOpen = false;
              "
            >
              <IconPhoto :size="16" />复制 PNG
            </button>
          </div>
        </div>
        <div class="mermaid-menu">
          <button
            class="mermaid-icon-button"
            type="button"
            title="导出"
            aria-label="导出"
            @click.stop="exportOpen = !exportOpen"
          >
            <IconDownload :size="18" />
          </button>
          <div v-if="exportOpen" class="mermaid-menu__panel">
            <button type="button" title="导出 PNG" @click="exportFile('png')">
              <IconPhoto :size="16" />PNG</button
            ><button type="button" title="导出 JPEG" @click="exportFile('jpg')">
              <IconPhoto :size="16" />JPEG</button
            ><button type="button" title="导出 WebP" @click="exportFile('webp')">
              <IconPhoto :size="16" />WebP</button
            ><button type="button" title="导出 SVG" @click="exportFile('svg')">
              <IconCode :size="16" />SVG</button
            ><button type="button" title="导出 PDF" @click="exportFile('pdf')">
              <IconFileText :size="16" />PDF</button
            ><button type="button" title="导出 MMD 源码" @click="exportFile('mmd')">
              <IconDownload :size="16" />MMD 源码</button
            ><button type="button" title="导出 Markdown" @click="exportFile('markdown')">
              <IconFileText :size="16" />Markdown</button
            ><button type="button" title="导出图表文档" @click="exportFile('json')">
              <IconCode :size="16" />图表文档
            </button>
          </div>
        </div>
        <div class="mermaid-menu">
          <button
            class="mermaid-icon-button"
            type="button"
            title="最近与历史"
            aria-label="最近与历史"
            :aria-expanded="historyOpen"
            @click.stop="historyOpen = !historyOpen"
          >
            <IconHistory :size="18" />
          </button>
          <div v-if="historyOpen" class="mermaid-history mermaid-history--toolbar">
            <div class="mermaid-history__heading">
              <strong>最近与历史</strong
              ><button
                type="button"
                title="关闭最近与历史"
                aria-label="关闭最近与历史"
                @click="historyOpen = false"
              >
                <IconX :size="15" />
              </button>
            </div>
            <div v-if="conflictDocument" class="mermaid-history__conflict" role="alert">
              <span>其他标签页有不同版本</span>
              <button type="button" title="载入其他标签页的版本" @click="acceptConflictDocument">
                载入
              </button>
              <button type="button" title="保留当前版本" @click="keepLocalDocument">
                保留当前
              </button>
            </div>
            <small class="mermaid-history__label">最近文档</small>
            <button
              v-for="document in documents.slice(0, 8)"
              :key="document.id"
              type="button"
              :title="`载入最近文档：${document.title}`"
              @click="
                loadDocument(document);
                historyOpen = false;
              "
            >
              <span>{{ document.title }}</span
              ><small>{{ new Date(document.updatedAt).toLocaleDateString() }}</small>
            </button>
            <p v-if="!documents.length">还没有保存的图表。</p>
            <small v-if="history.length" class="mermaid-history__label">历史快照</small>
            <button
              v-for="snapshot in history.slice(0, 8)"
              :key="`history-${snapshot.id}-${snapshot.updatedAt}`"
              type="button"
              :title="`恢复历史快照：${snapshot.title}`"
              @click="loadHistorySnapshot(snapshot)"
            >
              <span>{{ snapshot.title }}</span
              ><small>{{ new Date(snapshot.updatedAt).toLocaleDateString() }}</small>
            </button>
          </div>
        </div>
        <div class="mermaid-menu">
          <button
            class="mermaid-icon-button"
            type="button"
            title="分享链接"
            aria-label="分享链接"
            @click="copyShareLink"
          >
            <IconShare :size="18" />
          </button>
        </div>
        <button
          class="mermaid-icon-button"
          type="button"
          title="切换主题"
          aria-label="切换主题"
          @click="toggleTheme"
        >
          <IconSun v-if="resolvedTheme === 'dark'" :size="18" /><IconMoon v-else :size="18" />
        </button>
        <button
          class="mermaid-icon-button"
          type="button"
          :title="isFullscreen ? '退出全屏' : '全屏显示'"
          :aria-label="isFullscreen ? '退出全屏' : '全屏显示'"
          @click="toggleFullscreen"
        >
          <IconArrowsMinimize v-if="isFullscreen" :size="18" />
          <IconArrowsMaximize v-else :size="18" />
        </button>
      </div>
      <span v-if="shareMessage" class="mermaid-toolbar__feedback" role="status">
        {{ shareMessage }}
      </span>
    </header>
    <div class="mermaid-mobile-tabs">
      <button
        type="button"
        title="切换到编辑器"
        :class="{ active: mobilePane === 'editor' }"
        @click="mobilePane = 'editor'"
      >
        编辑器</button
      ><button
        type="button"
        title="切换到预览"
        :class="{ active: mobilePane === 'preview' }"
        @click="mobilePane = 'preview'"
      >
        预览
      </button>
    </div>
    <div
      class="mermaid-body"
      :class="{ 'is-resizing-sidebar': isResizingSidebar }"
      :style="{ '--mermaid-sidebar-width': `${sidebarWidth}px` }"
    >
      <aside class="mermaid-sidebar" :class="{ 'is-mobile-hidden': mobilePane === 'preview' }">
        <div class="mermaid-sidebar__tabs">
          <button
            type="button"
            title="代码编辑"
            :class="{ active: activeTab === 'code' }"
            @click="activeTab = 'code'"
          >
            <IconChartDots3 :size="16" />代码</button
          ><button
            type="button"
            title="图表示例"
            :class="{ active: activeTab === 'examples' }"
            @click="activeTab = 'examples'"
          >
            <IconClipboard :size="16" />示例</button
          ><button
            type="button"
            title="图表配置"
            :class="{ active: activeTab === 'config' }"
            @click="activeTab = 'config'"
          >
            <IconSettings :size="16" />配置
          </button>
        </div>
        <div v-show="activeTab === 'code'" class="mermaid-editor-pane">
          <div ref="sourceEditorMount" class="mermaid-monaco"></div>
        </div>
        <div v-show="activeTab === 'config'" class="mermaid-config-panel">
          <div v-if="parsedConfig.error" class="mermaid-config-error" role="alert">
            <strong>配置无法读取</strong>
            <p>{{ parsedConfig.error }}</p>
            <button type="button" title="恢复默认配置" @click="resetConfig">恢复常用配置</button>
          </div>
          <template v-else>
            <section class="mermaid-config-section">
              <div class="mermaid-config-section__heading">
                <span><IconPalette :size="16" />图表主题</span>
                <div class="mermaid-config-section__heading-actions">
                  <button
                    v-if="!isDefaultConfig"
                    type="button"
                    title="恢复默认配置"
                    @click="resetConfig"
                  >
                    恢复默认
                  </button>
                </div>
              </div>
              <div class="mermaid-theme-grid">
                <button
                  v-for="option in MERMAID_THEME_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="mermaid-theme-card"
                  :class="{ active: visualConfig.theme === option.value }"
                  :title="option.description"
                  @click="applyVisualConfig({ theme: option.value })"
                >
                  <span class="mermaid-theme-card__swatch" :data-theme="option.value"></span>
                  <span>
                    <strong>{{ option.label }}</strong>
                    <small>{{ option.description }}</small>
                  </span>
                  <IconCheck v-if="visualConfig.theme === option.value" :size="15" />
                </button>
              </div>
            </section>
            <section class="mermaid-config-section mermaid-config-section--fields">
              <label class="mermaid-config-field">
                <span>连线曲线</span>
                <span class="mermaid-select-wrap">
                  <select
                    :value="visualConfig.curve"
                    title="选择连线曲线"
                    @change="
                      applyVisualConfig({
                        curve: ($event.target as HTMLSelectElement)
                          .value as MermaidVisualConfig['curve'],
                      })
                    "
                  >
                    <option
                      v-for="option in MERMAID_CURVE_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <IconChevronDown :size="15" aria-hidden="true" />
                </span>
              </label>
              <label class="mermaid-config-field">
                <span
                  >字体大小 <output>{{ visualConfig.fontSize }}px</output></span
                >
                <input
                  type="range"
                  min="10"
                  max="32"
                  step="1"
                  :value="visualConfig.fontSize"
                  @input="
                    applyVisualConfig({
                      fontSize: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                />
              </label>
              <label class="mermaid-config-field">
                <span
                  >节点间距 <output>{{ visualConfig.nodeSpacing }}</output></span
                >
                <input
                  type="range"
                  min="0"
                  max="160"
                  step="5"
                  :value="visualConfig.nodeSpacing"
                  @input="
                    applyVisualConfig({
                      nodeSpacing: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                />
              </label>
              <label class="mermaid-config-field">
                <span
                  >层级间距 <output>{{ visualConfig.rankSpacing }}</output></span
                >
                <input
                  type="range"
                  min="0"
                  max="160"
                  step="5"
                  :value="visualConfig.rankSpacing"
                  @input="
                    applyVisualConfig({
                      rankSpacing: Number(($event.target as HTMLInputElement).value),
                    })
                  "
                />
              </label>
            </section>
            <section class="mermaid-config-section mermaid-config-section--switches">
              <label class="mermaid-config-switch">
                <input
                  type="checkbox"
                  :checked="visualConfig.htmlLabels"
                  @change="
                    applyVisualConfig({ htmlLabels: ($event.target as HTMLInputElement).checked })
                  "
                />
                <span><strong>富文本标签</strong><small>支持换行和基础 Markdown</small></span>
              </label>
              <label class="mermaid-config-switch">
                <input
                  type="checkbox"
                  :checked="visualConfig.useMaxWidth"
                  @change="
                    applyVisualConfig({ useMaxWidth: ($event.target as HTMLInputElement).checked })
                  "
                />
                <span><strong>适应可用宽度</strong><small>导出时仍保留完整图表边界</small></span>
              </label>
            </section>
            <p v-if="inlineConfigWarning" class="mermaid-config-warning">
              源码包含内置配置指令；设置会参与合并，资源限制始终由 Studio 锁定。
            </p>
          </template>
        </div>
        <div v-show="activeTab === 'examples'" class="mermaid-examples">
          <div class="mermaid-example-list">
            <div
              v-for="group in exampleCategoryGroups"
              :key="group.category"
              class="mermaid-example-group"
            >
              <div class="mermaid-example-picker">
                <button
                  type="button"
                  class="mermaid-example mermaid-example--primary"
                  :class="{ 'is-unavailable': group.primary.available === false }"
                  :disabled="group.primary.available === false"
                  :title="group.primary.description"
                  @click="loadExample(group.primary)"
                >
                  <span>
                    <strong>{{ group.category }}</strong>
                  </span>
                </button>
                <button
                  v-if="group.items.length > 1"
                  type="button"
                  class="mermaid-example__toggle"
                  :aria-label="`选择一个${group.category}示例`"
                  :aria-expanded="openExampleCategory === group.category"
                  :title="`选择一个${group.category}示例`"
                  @click.stop="toggleExampleCategory(group.category)"
                >
                  <IconChevronDown :size="15" />
                </button>
                <div v-if="openExampleCategory === group.category" class="mermaid-example-popover">
                  <button
                    v-for="example in group.items"
                    :key="example.id"
                    type="button"
                    :class="{ 'is-unavailable': example.available === false }"
                    :disabled="example.available === false"
                    :title="example.description || example.title"
                    @click="loadExample(example)"
                  >
                    <span>{{ example.title }}</span>
                    <small v-if="example.available === false">需扩展</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div
        class="mermaid-sidebar-resizer"
        role="separator"
        aria-label="调整编辑器与预览宽度"
        aria-orientation="vertical"
        :aria-valuenow="sidebarWidth"
        aria-valuemin="280"
        aria-valuemax="560"
        tabindex="0"
        @pointerdown="startSidebarResize"
        @keydown="handleSidebarResizeKeydown"
      ></div>
      <section
        class="mermaid-preview-pane"
        :class="{ 'is-mobile-hidden': mobilePane === 'editor' }"
      >
        <header class="mermaid-preview-toolbar">
          <div class="mermaid-preview-status">{{ detectedType }}</div>
          <div class="mermaid-preview-actions">
            <button
              class="mermaid-icon-button"
              :class="{ active: visualConfig.look === 'handDrawn' }"
              type="button"
              title="手绘风格"
              aria-label="手绘风格"
              :aria-pressed="visualConfig.look === 'handDrawn'"
              @click="
                applyVisualConfig({
                  look: visualConfig.look === 'handDrawn' ? 'classic' : 'handDrawn',
                })
              "
            >
              <IconBrush :size="17" /></button
            ><button
              class="mermaid-icon-button"
              type="button"
              title="重新渲染"
              aria-label="重新渲染"
              @click="render"
            >
              <IconRefresh :size="17" /></button
            ><button
              class="mermaid-icon-button"
              type="button"
              title="缩小"
              aria-label="缩小"
              @click="zoom(-0.1)"
            >
              <IconMinus :size="17" /></button
            ><span class="mermaid-zoom-label">{{ zoomLabel }}</span
            ><button
              class="mermaid-icon-button"
              type="button"
              title="放大"
              aria-label="放大"
              @click="zoom(0.1)"
            >
              <IconPlus :size="17" /></button
            ><button
              class="mermaid-icon-button"
              type="button"
              title="适应画布"
              aria-label="适应画布"
              @click="fitView"
            >
              <IconMaximize :size="17" /></button
            ><button
              class="mermaid-icon-button"
              :class="{ active: gridEnabled }"
              type="button"
              title="切换网格"
              aria-label="切换网格"
              :aria-pressed="gridEnabled"
              @click="toggleGrid"
            >
              <IconGrid4x4 :size="17" />
            </button>
          </div>
        </header>
        <div
          ref="canvasElement"
          class="mermaid-canvas"
          :class="{ 'is-grid-hidden': !gridEnabled, 'is-empty': previewState === 'idle' }"
          @wheel="handleWheel"
        >
          <div
            v-if="previewState === 'loading'"
            class="mermaid-canvas__message mermaid-canvas__message--overlay"
          >
            正在渲染图表…
          </div>
          <div
            v-else-if="previewState === 'error'"
            class="mermaid-canvas__message mermaid-canvas__message--error mermaid-canvas__message--overlay"
          >
            <strong>图表语法错误</strong>
            <p>{{ previewError }}</p>
            <button
              type="button"
              title="返回编辑器"
              @click="
                activeTab = 'code';
                mobilePane = 'editor';
              "
            >
              返回编辑器
            </button>
          </div>
          <div
            v-else-if="previewState === 'engine-error'"
            class="mermaid-canvas__message mermaid-canvas__message--error mermaid-canvas__message--overlay"
          >
            Mermaid 渲染器加载失败，请刷新页面后重试。
          </div>
          <div
            v-else-if="previewState === 'idle' && !source.trim()"
            class="mermaid-canvas__message"
          >
            输入 Mermaid 源码后，图表会显示在这里。
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
