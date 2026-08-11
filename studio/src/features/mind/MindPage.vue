<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import {
  IconArrowLeft,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowRight,
  IconArrowsMaximize,
  IconCirclePlus,
  IconCode,
  IconCopy,
  IconDownload,
  IconFilePlus,
  IconFolderOpen,
  IconHistory,
  IconLayoutColumns,
  IconLayoutGrid,
  IconLayoutRows,
  IconMarkdown,
  IconMoon,
  IconPalette,
  IconPlus,
  IconSearch,
  IconSitemap,
  IconSun,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-vue';
import type { MindElixirData, Theme } from 'mind-elixir';
import StudioLogo from '@/components/StudioLogo.vue';
import { useTheme } from '@/composables/useTheme';
import { receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { downloadBlob } from '@/core/browser/download';
import { MarkmapAdapter } from './adapters/MarkmapAdapter';
import { VisualMindEditorAdapter } from './adapters/VisualMindEditorAdapter';
import { markdownToMind, mindToMarkdown, textOutlineToMind } from './conversion';
import {
  createMindDocument,
  createVisualData,
  deleteMindDocument,
  duplicateMindDocument,
  getMindPreferences,
  listMindDocuments,
  saveMindDocument,
  saveMindPreferences,
  touchMindDocument,
} from './storage';
import type { MindDirection, MindDocument, MindDocumentType, MindThemeId } from './types';
import './mind.css';

type ExportFormat = 'mind' | 'json' | 'md' | 'png' | 'jpg' | 'webp' | 'svg';

interface MindThemeOption {
  id: MindThemeId;
  label: string;
  accent: string;
  darkAccent: string;
  rootLight: string;
  rootDark: string;
  palette: string[];
}

const MIND_THEME_OPTIONS: MindThemeOption[] = [
  {
    id: 'studio-light',
    label: '经典蓝',
    accent: '#2563a8',
    darkAccent: '#93c5fd',
    rootLight: '#2563a8',
    rootDark: '#1d4e89',
    palette: ['#2563a8', '#3b82f6', '#0ea5e9', '#1d4ed8', '#0284c7', '#0369a1'],
  },
  {
    id: 'studio-dark',
    label: '夜幕',
    accent: '#334155',
    darkAccent: '#cbd5e1',
    rootLight: '#334155',
    rootDark: '#273449',
    palette: ['#334155', '#475569', '#64748b', '#0f172a', '#1e293b', '#94a3b8'],
  },
  {
    id: 'green',
    label: '松绿',
    accent: '#16805f',
    darkAccent: '#6ee7b7',
    rootLight: '#16805f',
    rootDark: '#16604d',
    palette: ['#16805f', '#22a06b', '#0f766e', '#14b8a6', '#65a30d', '#4d7c0f'],
  },
  {
    id: 'blue',
    label: '海蓝',
    accent: '#087ea4',
    darkAccent: '#7dd3fc',
    rootLight: '#087ea4',
    rootDark: '#155e75',
    palette: ['#087ea4', '#0284c7', '#0891b2', '#0e7490', '#0369a1', '#06b6d4'],
  },
  {
    id: 'orange',
    label: '暖橙',
    accent: '#bf6518',
    darkAccent: '#fdba74',
    rootLight: '#bf6518',
    rootDark: '#8d4b1a',
    palette: ['#bf6518', '#ea7a22', '#d97706', '#f59e0b', '#c2410c', '#eab308'],
  },
  {
    id: 'mono',
    label: '石墨',
    accent: '#4b5563',
    darkAccent: '#d1d5db',
    rootLight: '#4b5563',
    rootDark: '#374151',
    palette: ['#4b5563', '#6b7280', '#374151', '#9ca3af', '#52525b', '#71717a'],
  },
];

const documents = ref<MindDocument[]>([]);
const activeDocument = ref<MindDocument | null>(null);
const titleDraft = ref('');
const searchQuery = ref('');
const savingState = ref<'saved' | 'saving' | 'failed'>('saved');
const saveError = ref('');
const creatingDocument = ref(false);
const switchingDocument = ref(false);
const headerVisible = ref(true);
const documentsOpen = ref(false);
const newMenuOpen = ref(false);
const exportMenuOpen = ref(false);
const layoutMenuOpen = ref(false);
const themeMenuOpen = ref(false);
const markdownSplit = ref(50);
const pageRoot = ref<HTMLElement | null>(null);
const visualHost = ref<HTMLElement | null>(null);
const markdownSvg = ref<SVGSVGElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const markdownTimer = ref<number | null>(null);
const hoveredNodeAction = ref<{
  id: string;
  left: number;
  top: number;
  deletable: boolean;
} | null>(null);
const editor = new VisualMindEditorAdapter();
const markmap = new MarkmapAdapter();
const { take: takeHandoffFile } = useFileHandoff();
const { resolved: resolvedTheme, toggle: toggleTheme } = useTheme();
let saveTimer: number | null = null;
let nodeActionsHideTimer: number | null = null;
let saveQueue = Promise.resolve();
let stopWindowFileHandoff: (() => void) | null = null;
let loadingDocument = false;
const HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('mind')}:header-collapsed`;

const visibleDocuments = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return documents.value;
  return documents.value.filter((document) => document.title.toLowerCase().includes(query));
});
const isVisual = computed(() => activeDocument.value?.type === 'visual');
const isMarkdown = computed(() => activeDocument.value?.type === 'markdown');
const activeThemeId = computed<MindThemeId>(
  () => activeDocument.value?.settings.themeId ?? 'studio-light',
);
const mindThemeStyle = computed(() => {
  const theme = getMindThemeOption(activeThemeId.value);
  const accent = resolvedTheme.value === 'dark' ? theme.darkAccent : theme.accent;
  return {
    '--mind-accent': accent,
    '--mind-accent-strong': accent,
    '--mind-accent-soft': `color-mix(in srgb, ${accent} 16%, var(--color-surface-solid))`,
  };
});
const saveLabel = computed(
  () => ({ saved: '已保存', saving: '正在保存…', failed: '保存失败' })[savingState.value],
);
const statusText = computed(() =>
  savingState.value === 'failed' ? saveError.value || saveLabel.value : saveLabel.value,
);

function getMindThemeOption(themeId: MindThemeId): MindThemeOption {
  return MIND_THEME_OPTIONS.find((theme) => theme.id === themeId) ?? MIND_THEME_OPTIONS[0];
}

function getMindAccent(themeId: MindThemeId, appTheme: 'light' | 'dark'): string {
  const theme = getMindThemeOption(themeId);
  return appTheme === 'dark' ? theme.darkAccent : theme.accent;
}

function getTheme(themeId: MindThemeId, appTheme: 'light' | 'dark'): Theme {
  const dark = appTheme === 'dark';
  const theme = getMindThemeOption(themeId);
  const accent = getMindAccent(themeId, appTheme);
  return {
    name: `${theme.label}${dark ? '深色' : '浅色'}`,
    type: appTheme,
    palette: theme.palette,
    cssVar: {
      '--root-color': '#ffffff',
      '--root-bgcolor': dark ? theme.rootDark : theme.rootLight,
      '--root-border-color': accent,
      '--main-border': `1.5px solid ${accent}`,
      '--main-color': dark ? '#e2e8f0' : '#334155',
      '--main-bgcolor': dark ? '#171b22' : '#ffffff',
      '--main-bgcolor-transparent': dark ? 'rgba(23, 27, 34, 0.88)' : 'rgba(255, 255, 255, 0.9)',
      '--color': dark ? '#dbe4ee' : '#334155',
      '--bgcolor': dark ? '#171b22' : '#f8fafc',
      '--selected': accent,
      '--accent-color': accent,
      '--panel-color': dark ? '226, 232, 240' : '30, 41, 59',
      '--panel-bgcolor': dark ? '30, 41, 59' : '255, 255, 255',
      '--panel-border-color': dark ? '#3b82f6' : '#93c5fd',
    },
  };
}

function toggleHeader(): void {
  headerVisible.value = !headerVisible.value;
  if (!storageAvailable()) return;
  try {
    if (headerVisible.value) localStorage.removeItem(HEADER_PREFERENCE_KEY);
    else localStorage.setItem(HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用时保留当前页面状态。
  }
}

function handleWorkspacePointerMove(event: PointerEvent): void {
  if (!isVisual.value || !(event.target instanceof Element)) return;
  if (event.target.closest('.mind-node-actions')) {
    clearNodeActionsHideTimer();
    return;
  }
  const node = event.target.closest<HTMLElement>('me-tpc');
  if (!node || !visualHost.value) {
    scheduleHideNodeActions();
    return;
  }
  clearNodeActionsHideTimer();
  const id = (node as HTMLElement & { nodeObj?: { id?: string } }).nodeObj?.id;
  if (!id) return;
  const nodeRect = node.getBoundingClientRect();
  const hostRect = visualHost.value.getBoundingClientRect();
  hoveredNodeAction.value = {
    id,
    left: nodeRect.left + nodeRect.width / 2 - hostRect.left,
    top: nodeRect.top - 35 - hostRect.top,
    deletable: !node.closest('me-root'),
  };
}

function clearNodeActionsHideTimer(): void {
  if (nodeActionsHideTimer === null) return;
  window.clearTimeout(nodeActionsHideTimer);
  nodeActionsHideTimer = null;
}

function scheduleHideNodeActions(): void {
  clearNodeActionsHideTimer();
  nodeActionsHideTimer = window.setTimeout(() => {
    hoveredNodeAction.value = null;
    nodeActionsHideTimer = null;
  }, 240);
}

async function addHoveredChild(): Promise<void> {
  const id = hoveredNodeAction.value?.id;
  if (!id) return;
  hoveredNodeAction.value = null;
  await editor.addChild(id);
}

async function addHoveredSibling(): Promise<void> {
  const id = hoveredNodeAction.value?.id;
  if (!id) return;
  hoveredNodeAction.value = null;
  await editor.addSibling(id);
}

async function removeHoveredNode(): Promise<void> {
  const node = hoveredNodeAction.value;
  if (!node?.deletable) return;
  hoveredNodeAction.value = null;
  await editor.removeNode(node.id);
}

function closeMenus(): void {
  newMenuOpen.value = false;
  exportMenuOpen.value = false;
  layoutMenuOpen.value = false;
  themeMenuOpen.value = false;
}

function toggleNewMenu(): void {
  newMenuOpen.value = !newMenuOpen.value;
  exportMenuOpen.value = false;
  layoutMenuOpen.value = false;
  themeMenuOpen.value = false;
}

function toggleExportMenu(): void {
  exportMenuOpen.value = !exportMenuOpen.value;
  newMenuOpen.value = false;
  layoutMenuOpen.value = false;
  themeMenuOpen.value = false;
}

function toggleLayoutMenu(): void {
  layoutMenuOpen.value = !layoutMenuOpen.value;
  newMenuOpen.value = false;
  exportMenuOpen.value = false;
  themeMenuOpen.value = false;
}

function toggleThemeMenu(): void {
  themeMenuOpen.value = !themeMenuOpen.value;
  newMenuOpen.value = false;
  exportMenuOpen.value = false;
  layoutMenuOpen.value = false;
}

function changeMindTheme(themeId: MindThemeId): void {
  if (!activeDocument.value) return;
  activeDocument.value.settings = { ...activeDocument.value.settings, themeId };
  const accent = getMindAccent(themeId, resolvedTheme.value);
  if (isVisual.value) editor.setTheme(getTheme(themeId, resolvedTheme.value));
  else markmap.setTheme(resolvedTheme.value, accent);
  themeMenuOpen.value = false;
  scheduleSave(0);
}

function changeLayout(direction: MindDirection): void {
  if (!activeDocument.value || activeDocument.value.type !== 'visual') return;
  activeDocument.value.settings = { ...activeDocument.value.settings, direction };
  editor.setDirection(direction);
  layoutMenuOpen.value = false;
  scheduleSave(0);
  requestAnimationFrame(() => editor.fit());
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  const element = target instanceof Element ? target : null;
  if (element?.closest('.mind-menu-anchor, .mind-popover, .mind-documents')) return;
  closeMenus();
  documentsOpen.value = false;
}

function handleMarkdownWheel(event: WheelEvent): void {
  const target = event.target;
  if (
    !isMarkdown.value ||
    !(target instanceof Element) ||
    !target.closest('.mind-markmap-preview') ||
    event.deltaY === 0
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.deltaY < 0) {
    void markmap.zoomIn();
    return;
  }
  void markmap.zoomOut();
}

function scheduleSave(delay = 700): void {
  if (!activeDocument.value || loadingDocument) return;
  if (saveTimer) window.clearTimeout(saveTimer);
  savingState.value = 'saving';
  saveTimer = window.setTimeout(() => void persistActive(), delay);
}

async function persistActive(): Promise<void> {
  if (!activeDocument.value) return;
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  const source = toRaw(activeDocument.value);
  const update =
    source.type === 'visual'
      ? {
          visualData: editor.getData() ?? source.visualData,
          title: titleDraft.value,
          settings: source.settings,
        }
      : { markdown: source.markdown ?? '', title: titleDraft.value, settings: source.settings };
  savingState.value = 'saving';
  saveQueue = saveQueue
    .then(async () => {
      const saved = await saveMindDocument(source, update);
      if (activeDocument.value?.id === saved.id) activeDocument.value = saved;
      const index = documents.value.findIndex((document) => document.id === saved.id);
      if (index >= 0) documents.value.splice(index, 1, saved);
      savingState.value = 'saved';
      saveError.value = '';
    })
    .catch((error: unknown) => {
      savingState.value = 'failed';
      saveError.value = error instanceof Error ? error.message : '无法写入本地思维导图。';
    });
  await saveQueue;
}

async function mountDocument(document: MindDocument): Promise<void> {
  loadingDocument = true;
  editor.dispose();
  markmap.dispose();
  activeDocument.value = await touchMindDocument(toRaw(document));
  titleDraft.value = activeDocument.value.title;
  const index = documents.value.findIndex((item) => item.id === document.id);
  if (index >= 0) documents.value.splice(index, 1, activeDocument.value);
  await saveMindPreferences({ activeDocumentId: document.id });
  await nextTick();

  if (activeDocument.value.type === 'visual' && visualHost.value) {
    editor.mount(
      visualHost.value,
      activeDocument.value.visualData ?? createVisualData(activeDocument.value.title),
      activeDocument.value.settings.direction,
      getTheme(activeThemeId.value, resolvedTheme.value),
      {
        onChange: () => scheduleSave(),
        onSelect: () => undefined,
      },
    );
    requestAnimationFrame(() => editor.fit());
  }
  if (activeDocument.value.type === 'markdown' && markdownSvg.value) {
    await markmap.mount(
      markdownSvg.value,
      activeDocument.value.markdown ?? '',
      resolvedTheme.value,
      getMindAccent(activeThemeId.value, resolvedTheme.value),
    );
  }
  loadingDocument = false;
  savingState.value = 'saved';
}

async function openDocument(document: MindDocument): Promise<void> {
  if (switchingDocument.value || document.id === activeDocument.value?.id) return;
  switchingDocument.value = true;
  try {
    await persistActive();
    await mountDocument(document);
    documentsOpen.value = false;
  } finally {
    switchingDocument.value = false;
  }
}

async function createDocument(type: MindDocumentType): Promise<void> {
  if (creatingDocument.value) return;
  creatingDocument.value = true;
  closeMenus();
  try {
    await persistActive();
    const document = await createMindDocument(type);
    documents.value.unshift(document);
    await mountDocument(document);
  } finally {
    creatingDocument.value = false;
  }
}

function updateTitle(): void {
  if (!activeDocument.value) return;
  titleDraft.value = titleDraft.value.trim() || activeDocument.value.title;
  scheduleSave(0);
}

async function duplicateDocument(document: MindDocument): Promise<void> {
  if (creatingDocument.value) return;
  creatingDocument.value = true;
  try {
    await persistActive();
    const copy = await duplicateMindDocument(toRaw(document));
    documents.value.unshift(copy);
    await mountDocument(copy);
    documentsOpen.value = false;
  } finally {
    creatingDocument.value = false;
  }
}

async function removeDocument(document: MindDocument): Promise<void> {
  if (!window.confirm(`删除“${document.title}”？本地文档将无法恢复。`)) return;
  await deleteMindDocument(document.id);
  documents.value = documents.value.filter((item) => item.id !== document.id);
  if (activeDocument.value?.id !== document.id) return;
  const next = documents.value[0] ?? (await createMindDocument('visual'));
  if (!documents.value.some((item) => item.id === next.id)) documents.value.unshift(next);
  await mountDocument(next);
}

function updateMarkdown(event: Event): void {
  if (!activeDocument.value) return;
  activeDocument.value.markdown = (event.target as HTMLTextAreaElement).value;
  if (markdownTimer.value) window.clearTimeout(markdownTimer.value);
  markdownTimer.value = window.setTimeout(
    () => void markmap.update(activeDocument.value?.markdown ?? ''),
    180,
  );
  scheduleSave();
}

const MARKDOWN_INDENT = '  ';

function handleMarkdownKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const target = event.target as HTMLTextAreaElement;
  event.preventDefault();
  const { selectionStart: start, selectionEnd: end, value } = target;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  if (start === end) {
    target.setRangeText(MARKDOWN_INDENT, start, end, 'end');
  } else {
    const blockEnd = value.indexOf('\n', end);
    const endIndex = blockEnd === -1 ? value.length : blockEnd;
    const block = value.slice(lineStart, endIndex);
    const indented = block.replace(/^/gm, MARKDOWN_INDENT);
    target.setRangeText(indented, lineStart, endIndex, 'end');
    target.setSelectionRange(lineStart, lineStart + indented.length);
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeSplit(event: PointerEvent): void {
  const startX = event.clientX;
  const initial = markdownSplit.value;
  const onMove = (move: PointerEvent) => {
    markdownSplit.value = Math.max(
      20,
      Math.min(70, initial + ((move.clientX - startX) / window.innerWidth) * 100),
    );
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    void saveMindPreferences({ markdownSplit: markdownSplit.value });
    void markmap.fit();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
}

async function convertMarkdown(): Promise<void> {
  const source = activeDocument.value;
  const markdown = source?.markdown;
  if (!source || !markdown || creatingDocument.value) return;
  creatingDocument.value = true;
  try {
    await persistActive();
    const document = await createMindDocument(
      'visual',
      `${source.title} - 可视化`,
      markdownToMind(markdown, source.title),
    );
    documents.value.unshift(document);
    await mountDocument(document);
  } finally {
    creatingDocument.value = false;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'mind-map';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMindElixirData(value: unknown): MindElixirData | null {
  const candidate = isRecord(value) && isRecord(value.visualData) ? value.visualData : value;
  if (!isRecord(candidate) || !isRecord(candidate.nodeData)) return null;
  if (typeof candidate.nodeData.id !== 'string') return null;
  return candidate as MindElixirData;
}

async function exportActive(format: ExportFormat): Promise<void> {
  closeMenus();
  if (!activeDocument.value) return;
  await persistActive();
  const source = toRaw(activeDocument.value);
  const name = safeFileName(source.title);
  if (format === 'json') {
    downloadBlob(
      new Blob([JSON.stringify(source.type === 'visual' ? source.visualData : source, null, 2)], {
        type: 'application/json',
      }),
      `${name}.json`,
    );
    return;
  }
  if (format === 'md') {
    const content =
      source.type === 'markdown' ? (source.markdown ?? '') : mindToMarkdown(source.visualData!);
    downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
    return;
  }
  if (format === 'mind') {
    const JSZip = (await import('jszip')).default;
    const archive = new JSZip();
    archive.file(
      'manifest.json',
      JSON.stringify({
        format: 'mind',
        formatVersion: 1,
        app: 'Meowv Studio',
        documentType: source.type,
        title: source.title,
        createdAt: new Date(source.createdAt).toISOString(),
        contentFile: source.type === 'visual' ? 'map.json' : 'content.md',
      }),
    );
    if (source.type === 'visual') archive.file('map.json', JSON.stringify(source.visualData));
    else archive.file('content.md', source.markdown ?? '');
    downloadBlob(
      await archive.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
      `${name}.mind`,
    );
    return;
  }
  const target = isVisual.value ? visualHost.value : markdownSvg.value?.parentElement;
  if (!target) return;
  const { snapdom } = await import('@zumer/snapdom');
  const capture = await snapdom(target, {
    backgroundColor: resolvedTheme.value === 'dark' ? '#171b22' : '#f8fafc',
    scale: 2,
  });
  await capture.download({ format, filename: name });
}

async function importMindFile(file: File): Promise<void> {
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error('导入文件不能超过 50 MB。');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'md') {
      const document = await createMindDocument(
        'markdown',
        file.name.replace(/\.md$/i, ''),
        await file.text(),
      );
      documents.value.unshift(document);
      await mountDocument(document);
      return;
    }
    if (extension === 'txt') {
      const title = file.name.replace(/\.txt$/i, '');
      const document = await createMindDocument(
        'visual',
        title,
        textOutlineToMind(await file.text(), title),
      );
      documents.value.unshift(document);
      await mountDocument(document);
      return;
    }
    if (extension === 'json') {
      const parsed = JSON.parse(await file.text()) as unknown;
      const fallbackTitle = file.name.replace(/\.json$/i, '');
      if (isRecord(parsed) && parsed.type === 'markdown' && typeof parsed.markdown === 'string') {
        const document = await createMindDocument(
          'markdown',
          typeof parsed.title === 'string' ? parsed.title : fallbackTitle,
          parsed.markdown,
        );
        documents.value.unshift(document);
        await mountDocument(document);
        return;
      }
      const data = getMindElixirData(parsed);
      if (!data) throw new Error('这不是有效的 JSON 文件。');
      const document = await createMindDocument(
        'visual',
        isRecord(parsed) && typeof parsed.title === 'string' ? parsed.title : fallbackTitle,
        data,
      );
      documents.value.unshift(document);
      await mountDocument(document);
      return;
    }
    if (extension === 'mind') {
      const JSZip = (await import('jszip')).default;
      const archive = await JSZip.loadAsync(file, { createFolders: false });
      const entries = Object.keys(archive.files);
      if (entries.length > 100 || !archive.file('manifest.json'))
        throw new Error('思维导图备份文件无效或包含过多条目。');
      const manifest = JSON.parse(await archive.file('manifest.json')!.async('text')) as {
        documentType?: MindDocumentType;
        title?: string;
        contentFile?: string;
      };
      const type = manifest.documentType;
      const content = manifest.contentFile && archive.file(manifest.contentFile);
      if (!content || (type !== 'visual' && type !== 'markdown'))
        throw new Error('备份文件缺少可识别的文档内容。');
      const document = await createMindDocument(
        type,
        manifest.title ?? file.name.replace(/\.mind$/i, ''),
        type === 'visual' ? JSON.parse(await content.async('text')) : await content.async('text'),
      );
      documents.value.unshift(document);
      await mountDocument(document);
      return;
    }
    throw new Error('仅支持 .mind、.json、.md 和 .txt 文件。');
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '导入失败。';
    savingState.value = 'failed';
  }
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await importMindFile(file);
  input.value = '';
}

function handleShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const editing = target?.matches('input, textarea, [contenteditable="true"]');
  if (event.key === 'Escape') {
    closeMenus();
    documentsOpen.value = false;
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void persistActive();
  }
  if (!editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    importInput.value?.click();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') void persistActive();
}

async function initialize(): Promise<void> {
  if (storageAvailable()) {
    try {
      headerVisible.value = localStorage.getItem(HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时默认显示顶部栏。
    }
  }
  const preferences = await getMindPreferences();
  markdownSplit.value = preferences.markdownSplit;
  documents.value = await listMindDocuments();
  const initial =
    documents.value.find((document) => document.id === preferences.activeDocumentId) ??
    documents.value[0] ??
    (await createMindDocument('visual'));
  if (!documents.value.some((document) => document.id === initial.id))
    documents.value.unshift(initial);
  await mountDocument(initial);
  const handoff = takeHandoffFile('mind');
  if (handoff) await importMindFile(handoff);
}

watch(resolvedTheme, (theme) => {
  const themeId = activeThemeId.value;
  editor.setTheme(getTheme(themeId, theme));
  markmap.setTheme(theme, getMindAccent(themeId, theme));
});

onMounted(() => {
  void initialize().then(() => {
    stopWindowFileHandoff = receiveWindowFileHandoff('mind', (file) => {
      void importMindFile(file);
    });
  });
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('wheel', handleMarkdownWheel, { capture: true, passive: false });
  document.addEventListener('keydown', handleShortcut);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  void persistActive();
  editor.dispose();
  markmap.dispose();
  stopWindowFileHandoff?.();
  if (saveTimer) window.clearTimeout(saveTimer);
  if (nodeActionsHideTimer !== null) window.clearTimeout(nodeActionsHideTimer);
  if (markdownTimer.value) window.clearTimeout(markdownTimer.value);
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('wheel', handleMarkdownWheel, true);
  document.removeEventListener('keydown', handleShortcut);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <section
    ref="pageRoot"
    class="mind-editor"
    :class="{ 'mind-editor--header-collapsed': !headerVisible }"
    :style="mindThemeStyle"
    aria-label="思维导图编辑器"
  >
    <input
      ref="importInput"
      class="visually-hidden"
      type="file"
      accept=".mind,.json,.md,.txt"
      @change="importFile"
    />

    <header v-show="headerVisible" class="mind-editor__header">
      <div class="mind-editor__header-start">
        <RouterLink class="mind-editor__home" to="/" aria-label="返回 Studio">
          <StudioLogo />
        </RouterLink>
        <strong class="mind-editor__name">思维导图</strong>
      </div>

      <input
        v-model="titleDraft"
        class="mind-editor__title"
        maxlength="120"
        aria-label="当前思维导图名称"
        @blur="updateTitle"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
      />

      <div class="mind-editor__actions" aria-label="思维导图操作">
        <div v-if="isVisual" class="mind-editor__action-group">
          <button
            class="mind-action"
            type="button"
            aria-label="撤销"
            data-tooltip="撤销"
            @click="editor.undo"
          >
            <IconArrowBackUp :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="重做"
            data-tooltip="重做"
            @click="editor.redo"
          >
            <IconArrowForwardUp :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="缩小画布"
            data-tooltip="缩小"
            @click="editor.zoomOut()"
          >
            <IconZoomOut :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="放大画布"
            data-tooltip="放大"
            @click="editor.zoomIn()"
          >
            <IconZoomIn :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="适应画布"
            data-tooltip="适应画布"
            @click="editor.fit()"
          >
            <IconArrowsMaximize :size="18" />
          </button>
          <div class="mind-menu-anchor">
            <button
              class="mind-action"
              type="button"
              aria-label="切换布局"
              data-tooltip="切换布局"
              :aria-expanded="layoutMenuOpen"
              @click.stop="toggleLayoutMenu"
            >
              <IconLayoutGrid :size="18" />
            </button>
            <div v-if="layoutMenuOpen" class="mind-popover mind-popover--layout">
              <button
                type="button"
                :class="{ 'mind-popover__active': activeDocument?.settings.direction === 'both' }"
                @click="changeLayout('both')"
              >
                <IconLayoutColumns :size="16" />左右布局
              </button>
              <button
                type="button"
                :class="{ 'mind-popover__active': activeDocument?.settings.direction === 'right' }"
                @click="changeLayout('right')"
              >
                <IconArrowRight :size="16" />向右布局
              </button>
              <button
                type="button"
                :class="{ 'mind-popover__active': activeDocument?.settings.direction === 'left' }"
                @click="changeLayout('left')"
              >
                <IconArrowLeft :size="16" />向左布局
              </button>
              <button
                type="button"
                :class="{ 'mind-popover__active': activeDocument?.settings.direction === 'down' }"
                @click="changeLayout('down')"
              >
                <IconLayoutRows :size="16" />上下布局
              </button>
            </div>
          </div>
        </div>
        <div v-if="isMarkdown" class="mind-editor__action-group">
          <button
            class="mind-action"
            type="button"
            aria-label="缩小 Markdown 脑图"
            data-tooltip="缩小"
            @click="markmap.zoomOut()"
          >
            <IconZoomOut :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="放大 Markdown 脑图"
            data-tooltip="放大"
            @click="markmap.zoomIn()"
          >
            <IconZoomIn :size="18" />
          </button>
          <button
            class="mind-action"
            type="button"
            aria-label="适应 Markdown 脑图"
            data-tooltip="适应画布"
            @click="markmap.fit()"
          >
            <IconArrowsMaximize :size="18" />
          </button>
        </div>
        <div class="mind-menu-anchor">
          <button
            class="mind-action"
            type="button"
            aria-label="切换脑图配色"
            data-tooltip="脑图配色"
            :aria-expanded="themeMenuOpen"
            @click.stop="toggleThemeMenu"
          >
            <IconPalette :size="18" />
          </button>
          <div v-if="themeMenuOpen" class="mind-popover mind-popover--theme">
            <button
              v-for="theme in MIND_THEME_OPTIONS"
              :key="theme.id"
              class="mind-theme-option"
              type="button"
              :class="{ 'mind-popover__active': theme.id === activeThemeId }"
              @click="changeMindTheme(theme.id)"
            >
              <span class="mind-theme-option__swatch" :style="{ background: theme.accent }"></span>
              {{ theme.label }}
            </button>
          </div>
        </div>
        <button
          v-if="isMarkdown"
          class="mind-action"
          type="button"
          aria-label="转换为可编辑脑图"
          data-tooltip="转换为可编辑脑图"
          :disabled="creatingDocument"
          @click="convertMarkdown"
        >
          <IconCode :size="18" />
        </button>

        <span class="mind-editor__separator" aria-hidden="true"></span>

        <div class="mind-menu-anchor">
          <button
            class="mind-action"
            type="button"
            aria-label="新建"
            data-tooltip="新建"
            :aria-expanded="newMenuOpen"
            :disabled="creatingDocument"
            @click.stop="toggleNewMenu"
          >
            <IconFilePlus :size="18" />
          </button>
          <div v-if="newMenuOpen" class="mind-popover mind-popover--compact">
            <button type="button" :disabled="creatingDocument" @click="createDocument('visual')">
              <IconSitemap :size="17" />思维导图
            </button>
            <button type="button" :disabled="creatingDocument" @click="createDocument('markdown')">
              <IconMarkdown :size="17" />Markdown 脑图
            </button>
          </div>
        </div>

        <button
          class="mind-action"
          type="button"
          aria-label="打开文件"
          data-tooltip="打开文件"
          @click="importInput?.click()"
        >
          <IconFolderOpen :size="18" />
        </button>
        <button
          class="mind-action"
          type="button"
          aria-label="历史思维导图"
          data-tooltip="历史思维导图"
          :aria-expanded="documentsOpen"
          @click="
            documentsOpen = !documentsOpen;
            closeMenus();
          "
        >
          <IconHistory :size="18" />
        </button>

        <div class="mind-menu-anchor">
          <button
            class="mind-action"
            type="button"
            aria-label="导出"
            data-tooltip="导出"
            :aria-expanded="exportMenuOpen"
            @click.stop="toggleExportMenu"
          >
            <IconDownload :size="18" />
          </button>
          <div v-if="exportMenuOpen" class="mind-popover mind-popover--export">
            <button type="button" @click="exportActive('mind')">完整备份</button>
            <button type="button" @click="exportActive('md')">Markdown</button>
            <button type="button" @click="exportActive('png')">PNG 图片</button>
            <button type="button" @click="exportActive('svg')">SVG 图片</button>
            <button type="button" @click="exportActive('json')">JSON 数据</button>
          </div>
        </div>

        <button
          class="mind-action"
          type="button"
          :aria-label="resolvedTheme === 'dark' ? '切换浅色主题' : '切换深色主题'"
          :data-tooltip="resolvedTheme === 'dark' ? '浅色主题' : '深色主题'"
          @click="toggleTheme"
        >
          <IconSun v-if="resolvedTheme === 'dark'" :size="18" />
          <IconMoon v-else :size="18" />
        </button>
      </div>
    </header>

    <studio-header-toggle :visible="headerVisible" @click="toggleHeader" />

    <main
      class="mind-editor__workspace"
      @pointermove="handleWorkspacePointerMove"
      @pointerleave="scheduleHideNodeActions"
    >
      <div
        v-if="isVisual"
        ref="visualHost"
        class="mind-visual-canvas"
        aria-label="可编辑思维导图画布"
      ></div>

      <div
        v-if="isVisual && hoveredNodeAction"
        class="mind-node-actions"
        :style="{ left: `${hoveredNodeAction.left}px`, top: `${hoveredNodeAction.top}px` }"
        aria-label="节点操作"
        @pointerenter="clearNodeActionsHideTimer"
        @pointerleave="scheduleHideNodeActions"
      >
        <button
          type="button"
          aria-label="添加子节点"
          data-tooltip="添加子节点 · Tab"
          @click="addHoveredChild"
        >
          <IconCirclePlus :size="13" />
        </button>
        <button
          type="button"
          aria-label="添加同级节点"
          data-tooltip="添加同级节点 · Enter"
          @click="addHoveredSibling"
        >
          <IconPlus :size="13" />
        </button>
        <button
          type="button"
          aria-label="删除节点"
          data-tooltip="删除节点 · Delete"
          :disabled="!hoveredNodeAction.deletable"
          @click="removeHoveredNode"
        >
          <IconTrash :size="13" />
        </button>
      </div>

      <div
        v-else-if="isMarkdown"
        class="mind-markdown-canvas"
        :style="{ '--markdown-split': `${markdownSplit}%` }"
      >
        <textarea
          class="mind-markdown-editor"
          :value="activeDocument?.markdown"
          aria-label="Markdown 脑图内容"
          @input="updateMarkdown"
          @keydown="handleMarkdownKeydown"
        ></textarea>
        <div
          class="mind-markdown-resizer"
          role="separator"
          aria-label="调整 Markdown 与预览宽度"
          @pointerdown.prevent="changeSplit"
        ></div>
        <div class="mind-markmap-preview">
          <svg ref="markdownSvg" aria-label="Markdown 思维导图预览"></svg>
        </div>
      </div>

      <aside v-if="documentsOpen" class="mind-documents" aria-label="历史思维导图">
        <div class="mind-documents__header">
          <strong>历史思维导图</strong>
          <button type="button" aria-label="关闭历史思维导图" @click="documentsOpen = false">
            ×
          </button>
        </div>
        <label class="mind-documents__search">
          <IconSearch :size="16" />
          <input v-model="searchQuery" type="search" placeholder="搜索思维导图" />
        </label>
        <div class="mind-documents__list">
          <div
            v-for="document in visibleDocuments"
            :key="document.id"
            class="mind-document"
            :class="{ 'mind-document--active': document.id === activeDocument?.id }"
          >
            <button
              class="mind-document__open"
              type="button"
              :disabled="switchingDocument"
              @click="openDocument(document)"
            >
              <component :is="document.type === 'visual' ? IconSitemap : IconMarkdown" :size="17" />
              <span>
                <strong>{{ document.title }}</strong>
                <small>{{ new Date(document.updatedAt).toLocaleString('zh-CN') }}</small>
              </span>
            </button>
            <button
              class="mind-document__action"
              type="button"
              aria-label="复制文档"
              @click="duplicateDocument(document)"
            >
              <IconCopy :size="15" />
            </button>
            <button
              class="mind-document__action mind-document__action--danger"
              type="button"
              aria-label="删除文档"
              @click="removeDocument(document)"
            >
              <IconTrash :size="15" />
            </button>
          </div>
        </div>
      </aside>

      <span class="mind-save-status" :class="`mind-save-status--${savingState}`" role="status">
        {{ statusText }}
      </span>
    </main>
  </section>
</template>
