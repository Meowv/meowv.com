<script setup lang="ts">
import {
  Adjustments,
  Book,
  BrandAdobePhotoshop,
  Braces,
  Chalkboard,
  ChartDots3,
  ChevronsDown,
  Crop,
  Database,
  FileDescription,
  FileTypePdf,
  FilePlus2,
  FolderPlus,
  ImageDown,
  ImageUp,
  LoaderCircle,
  Music,
  Movie,
  Pencil,
  PhotoEdit,
  PhotoScan,
  RefreshCw,
  Resize,
  RotateCcw,
  Sitemap,
  Trash2,
  Video,
} from '@/features/markdown/icons';
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, toRef, watch } from 'vue';
import ToolIcon from '@/features/tools/components/ToolIcon.vue';
import { getToolsByCategory } from '@/features/tools/tools';
import FileTreeNode from './FileTreeNode.vue';
import { ACTIVE_TREE_PATH, EXPANDED_TREE_PATHS } from './tree-state';
import { useWorkspaceStore, type DisplayTreeNode } from '@/features/markdown/stores/workspace';
import { createTypedMediaBlob } from '@/features/markdown/services/media';
import { createImagePreviewBlob } from '@/features/markdown/services/image-preview';
import { isMermaidFile } from '@/features/markdown/services/file-system';
import { openWindowFileHandoff } from '@/core/browser/file-handoff';

type DialogKind = 'new-file' | 'new-folder' | 'rename' | 'delete';
const ROOT_BATCH_SIZE = 200;
const IMAGE_TOOLS = [
  { id: 'image-compress', label: '图片压缩', icon: ImageDown },
  { id: 'image-convert', label: '格式转换', icon: ImageUp },
  { id: 'image-resize', label: '尺寸调整', icon: Resize },
  { id: 'image-crop', label: '图片裁剪', icon: Crop },
  { id: 'image-watermark', label: '添加水印', icon: PhotoEdit },
  { id: 'image-rounded-corners', label: '添加圆角', icon: PhotoScan },
  { id: 'image-padding', label: '补边留白', icon: Adjustments },
  { id: 'images-to-pdf', label: '图片转 PDF', icon: FileTypePdf },
  { id: 'merge-gif', label: '合并为 GIF', icon: Movie },
] as const;
const PDF_TOOLS = getToolsByCategory('pdf');

interface ContextMenuState {
  x: number;
  y: number;
  node: DisplayTreeNode;
}

interface PointerDragState {
  node: DisplayTreeNode;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type DropTargetState = 'none' | 'valid' | 'invalid';

interface DropTarget {
  path: string | null;
  state: DropTargetState;
}

const store = useWorkspaceStore();
const expandedPaths = ref(new Set(['', '技术', '技术/.NET', '前端', '生活']));
provide(ACTIVE_TREE_PATH, toRef(store, 'activePath'));
provide(EXPANDED_TREE_PATHS, expandedPaths);
const contextMenu = ref<ContextMenuState | null>(null);
const dialogKind = ref<DialogKind | null>(null);
const dialogTarget = ref<DisplayTreeNode | null>(null);
const dialogValue = ref('');
const dialogBusy = ref(false);
const dialogInput = ref<HTMLInputElement | null>(null);
const visibleRootCount = ref(ROOT_BATCH_SIZE);
const draggingNode = ref<DisplayTreeNode | null>(null);
const dropTargetPath = ref<string | null>(null);
const dropTargetState = ref<DropTargetState>('none');
const imagePreview = ref<{ name: string; url?: string; loading: boolean } | null>(null);
const mediaPreview = ref<{
  name: string;
  url: string;
  category: 'audio' | 'video';
} | null>(null);
const mediaError = ref('');
const officeTarget = ref<DisplayTreeNode | null>(null);
const officeBusy = ref(false);
const pdfTarget = ref<{ node: DisplayTreeNode; slug: string; label: string } | null>(null);
const pdfBusy = ref(false);
let pointerDrag: PointerDragState | null = null;
let suppressDraggedClick = false;
let pointerFrame: number | undefined;
let pendingPointerPosition: { x: number; y: number } | null = null;
let imagePreviewSequence = 0;
const rootChildren = computed(() => store.treeRoot?.children ?? []);
const visibleRootChildren = computed(() => rootChildren.value.slice(0, visibleRootCount.value));
const remainingRootCount = computed(() =>
  Math.max(0, rootChildren.value.length - visibleRootChildren.value.length),
);
const nextRootBatchSize = computed(() => Math.min(ROOT_BATCH_SIZE, remainingRootCount.value));

function expandPathAncestors(path: string): void {
  const segments = path.split('/');
  segments.pop();
  if (!segments.length) {
    return;
  }
  const next = new Set(expandedPaths.value);
  let changed = false;
  for (let index = 1; index <= segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join('/');
    if (!next.has(ancestor)) {
      next.add(ancestor);
      changed = true;
    }
  }
  if (changed) {
    expandedPaths.value = next;
  }
}

watch([() => store.workspaceName, () => rootChildren.value.length], () => {
  visibleRootCount.value = ROOT_BATCH_SIZE;
});

watch(
  () => store.activePath,
  (path) => {
    if (path) {
      expandPathAncestors(path);
    }
  },
  { immediate: true },
);

const documentCount = computed(() => {
  let count = 0;
  const visit = (node: DisplayTreeNode): void => {
    if (node.kind === 'file') {
      count += 1;
    }
    node.children?.forEach(visit);
  };
  if (store.treeRoot) {
    visit(store.treeRoot);
  }
  return count;
});

const directoryCount = computed(() => {
  let count = 0;
  const visit = (node: DisplayTreeNode): void => {
    if (node.kind === 'directory' && node.path) {
      count += 1;
    }
    node.children?.forEach(visit);
  };
  if (store.treeRoot) {
    visit(store.treeRoot);
  }
  return count;
});

const dialogTitle = computed(() => {
  if (dialogKind.value === 'new-file') {
    return '新建 Markdown 文件';
  }
  if (dialogKind.value === 'new-folder') {
    return '新建文件夹';
  }
  if (dialogKind.value === 'rename') {
    return '重命名';
  }
  return '确认删除';
});

const dialogDescription = computed(() => {
  if (dialogKind.value === 'delete') {
    return `“${dialogTarget.value?.name ?? ''}”将从本地文件夹永久删除，此操作无法撤销。`;
  }
  if (dialogKind.value === 'new-file') {
    return '未填写扩展名时会自动使用 .md。';
  }
  return '';
});

function toggleDirectory(node: DisplayTreeNode): void {
  const next = new Set(expandedPaths.value);
  if (next.has(node.path)) {
    next.delete(node.path);
  } else {
    next.add(node.path);
  }
  expandedPaths.value = next;
}

function openContextMenu(event: MouseEvent, node: DisplayTreeNode): void {
  if (node.kind === 'file' && node.category === 'other') {
    return;
  }
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    node,
  };
  void nextTick(() => {
    const menu = document.querySelector<HTMLElement>('.context-menu--explorer');
    if (!menu || contextMenu.value?.node !== node) {
      return;
    }
    const { width, height } = menu.getBoundingClientRect();
    const inset = 8;
    contextMenu.value = {
      ...contextMenu.value,
      x: Math.max(inset, Math.min(event.clientX, globalThis.innerWidth - width - inset)),
      y: Math.max(inset, Math.min(event.clientY, globalThis.innerHeight - height - inset)),
    };
  });
}

function isMermaidDocumentNode(node: DisplayTreeNode): boolean {
  return node.kind === 'file' && isMermaidFile(node.name);
}

function isJsonDocumentNode(node: DisplayTreeNode): boolean {
  return node.kind === 'file' && (node.extension === '.json' || node.extension === '.jsonc');
}

async function getNodeFile(node: DisplayTreeNode): Promise<File | null> {
  if (node.kind !== 'file' || node.handle?.kind !== 'file') {
    return null;
  }
  return (node.handle as FileSystemFileHandle).getFile();
}

async function openNode(node: DisplayTreeNode): Promise<void> {
  if (isMermaidDocumentNode(node)) {
    await openMermaidInNewWindow(node);
    return;
  }
  if (isJsonDocumentNode(node)) {
    await openJsonInNewWindow(node);
    return;
  }
  if (node.category === 'markdown' || node.category === 'text') {
    await store.openDocument(node.path);
    return;
  }
  if (node.category === 'image') {
    if (node.extension === '.psd') {
      await openPsdViewerInNewWindow(node);
      return;
    }
    closeMediaPreview();
    closeImagePreview();
    const sequence = imagePreviewSequence;
    imagePreview.value = { name: node.name, loading: true };
    try {
      const file = await getNodeFile(node);
      if (file) {
        const preview = await createImagePreviewBlob(file);
        const url = URL.createObjectURL(preview);
        if (sequence !== imagePreviewSequence) {
          URL.revokeObjectURL(url);
          return;
        }
        imagePreview.value = { name: node.name, url, loading: false };
      }
    } catch (error) {
      if (sequence === imagePreviewSequence) {
        closeImagePreview();
      }
      store.notify('error', '无法预览图片', error instanceof Error ? error.message : node.name);
    }
    return;
  }
  if (node.category === 'audio' || node.category === 'video') {
    await openMediaPreview(node);
    return;
  }
  if (node.category === 'office') {
    officeTarget.value = node;
    return;
  }
  if (node.category === 'pdf' || node.category === 'book') {
    await openBookInNewWindow(node);
    return;
  }
  if (node.category === 'draw') {
    await openDrawInNewWindow(node);
    return;
  }
  if (node.category === 'mind') {
    await openMindInNewWindow(node);
    return;
  }
  if (node.category === 'sqlite') {
    await openSqliteInNewWindow(node);
  }
}

async function openMermaidInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开 Mermaid', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取 Mermaid 文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/mermaid', 'mermaid', file);
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开 Mermaid', error instanceof Error ? error.message : node.name);
  }
}

async function openJsonInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开 JSON 编辑器', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取 JSON 文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/tools/json', 'json', file);
  } catch (error) {
    popup.close();
    store.notify(
      'error',
      '无法打开 JSON 编辑器',
      error instanceof Error ? error.message : node.name,
    );
  }
}

function closeImagePreview(): void {
  imagePreviewSequence += 1;
  if (imagePreview.value?.url) {
    URL.revokeObjectURL(imagePreview.value.url);
  }
  imagePreview.value = null;
}

async function openMediaPreview(node: DisplayTreeNode): Promise<void> {
  closeImagePreview();
  closeMediaPreview();
  try {
    const file = await getNodeFile(node);
    if (!file || (node.category !== 'audio' && node.category !== 'video')) {
      return;
    }
    mediaPreview.value = {
      name: node.name,
      url: URL.createObjectURL(createTypedMediaBlob(file, node.category)),
      category: node.category,
    };
  } catch (error) {
    store.notify('error', '无法打开媒体文件', error instanceof Error ? error.message : node.name);
  }
}

function closeMediaPreview(): void {
  if (mediaPreview.value) {
    URL.revokeObjectURL(mediaPreview.value.url);
    mediaPreview.value = null;
  }
  mediaError.value = '';
}

function handleMediaError(): void {
  mediaError.value = '当前浏览器不支持此文件的媒体编码。';
}

async function openResourceTool(node: DisplayTreeNode, toolId: string): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开图片工具', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('当前文件无法交给目标工具。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, `/tools/${toolId}`, 'image', file);
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开工具', error instanceof Error ? error.message : node.name);
  }
}

async function openPsdViewerInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开 PSD 查看', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取 PSD 文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/tools/psd-viewer', 'psd', file);
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开 PSD 查看', error instanceof Error ? error.message : node.name);
  }
}

async function openDrawInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开白板', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    if (node.kind !== 'file' || node.handle?.kind !== 'file') {
      throw new Error('无法读取 Excalidraw 文件。');
    }
    const handle = node.handle as FileSystemFileHandle;
    try {
      const currentPermission = await handle.queryPermission({ mode: 'readwrite' });
      if (currentPermission !== 'granted') {
        await handle.requestPermission({ mode: 'readwrite' });
      }
    } catch {
      // 句柄仍会交给白板，用户可在后续保存时重新授权。
    }
    const file = await handle.getFile();
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/draw', 'draw', file, handle);
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开白板', error instanceof Error ? error.message : node.name);
  }
}

async function openMindInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开思维导图', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取 .mind 文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/mind', 'mind', file);
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开思维导图', error instanceof Error ? error.message : node.name);
  }
}

async function openSqliteInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify(
      'error',
      '无法打开 SQLite Online',
      '浏览器阻止了新窗口，请允许本站打开弹出式窗口。',
    );
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取 SQLite 数据库文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(popup, '/tools/sqlite', 'sqlite', file);
  } catch (error) {
    popup.close();
    store.notify(
      'error',
      '无法打开 SQLite Online',
      error instanceof Error ? error.message : node.name,
    );
  }
}

async function openBookInNewWindow(node: DisplayTreeNode): Promise<void> {
  contextMenu.value = null;
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开仿真书', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  try {
    if (!(await store.saveActiveDocument())) {
      popup.close();
      return;
    }
    const file = await getNodeFile(node);
    if (!file) {
      throw new Error('无法读取书籍文件。');
    }
    closeImagePreview();
    closeMediaPreview();
    openWindowFileHandoff(
      popup,
      '/books',
      'book',
      file,
      node.handle?.kind === 'file' ? (node.handle as FileSystemFileHandle) : undefined,
    );
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开仿真书', error instanceof Error ? error.message : node.name);
  }
}

function promptPdfTool(node: DisplayTreeNode, slug: string, label: string): void {
  contextMenu.value = null;
  pdfTarget.value = { node, slug, label };
}

async function confirmPdfTool(): Promise<void> {
  const target = pdfTarget.value;
  if (!target || target.node.kind !== 'file' || target.node.handle?.kind !== 'file') {
    return;
  }
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开 PDF 工具', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  pdfBusy.value = true;
  try {
    const handle = target.node.handle as FileSystemFileHandle;
    const permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') {
      popup.close();
      store.notify('info', '未获得文件授权', 'PDF 工具没有打开此文件。');
      return;
    }
    const file = await handle.getFile();
    openWindowFileHandoff(popup, `/tools/${target.slug}`, 'pdf', file);
    pdfTarget.value = null;
  } catch (error) {
    popup.close();
    store.notify(
      'error',
      '无法打开 PDF 工具',
      error instanceof Error ? error.message : target.node.name,
    );
  } finally {
    pdfBusy.value = false;
  }
}

async function openOfficeInNewWindow(): Promise<void> {
  const node = officeTarget.value;
  if (!node || node.kind !== 'file' || node.handle?.kind !== 'file') {
    return;
  }
  const popup = globalThis.open('about:blank', '_blank');
  if (!popup) {
    store.notify('error', '无法打开 Office', '浏览器阻止了新窗口，请允许本站打开弹出式窗口。');
    return;
  }
  officeBusy.value = true;
  try {
    const handle = node.handle as FileSystemFileHandle;
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      popup.close();
      store.notify('info', '未获得文件授权', 'Office 编辑器没有打开此文件。');
      return;
    }
    const file = await handle.getFile();
    openWindowFileHandoff(popup, '/office', 'office', file, handle);
    officeTarget.value = null;
  } catch (error) {
    popup.close();
    store.notify('error', '无法打开 Office', error instanceof Error ? error.message : node.name);
  } finally {
    officeBusy.value = false;
  }
}

function actionParentPath(node: DisplayTreeNode | null): string {
  if (!node) {
    return '';
  }
  if (node.kind === 'directory') {
    return node.path;
  }
  const segments = node.path.split('/');
  segments.pop();
  return segments.join('/');
}

function openDialog(kind: DialogKind, node: DisplayTreeNode | null = null): void {
  contextMenu.value = null;
  dialogKind.value = kind;
  dialogTarget.value = node;
  dialogValue.value = kind === 'rename' ? (node?.name ?? '') : '';
  void nextTick(() => {
    dialogInput.value?.focus();
    dialogInput.value?.select();
  });
}

function closeDialog(force = false): void {
  if (dialogBusy.value && !force) {
    return;
  }
  dialogKind.value = null;
  dialogTarget.value = null;
  dialogValue.value = '';
}

async function submitDialog(): Promise<void> {
  const kind = dialogKind.value;
  if (!kind) {
    return;
  }
  dialogBusy.value = true;
  try {
    if (kind === 'new-file') {
      await store.createDocument(actionParentPath(dialogTarget.value), dialogValue.value);
    } else if (kind === 'new-folder') {
      await store.createFolder(actionParentPath(dialogTarget.value), dialogValue.value);
    } else if (kind === 'rename' && dialogTarget.value) {
      await store.renameNode(dialogTarget.value, dialogValue.value);
    } else if (kind === 'delete' && dialogTarget.value) {
      await store.removeNode(dialogTarget.value);
    }
    closeDialog(true);
  } finally {
    dialogBusy.value = false;
  }
}

function closeContextMenu(): void {
  contextMenu.value = null;
}

function refreshWorkspace(): void {
  contextMenu.value = null;
  void store.refreshWorkspace({ feedback: true });
}

function showMoreRootNodes(): void {
  visibleRootCount.value = Math.min(
    rootChildren.value.length,
    visibleRootCount.value + ROOT_BATCH_SIZE,
  );
}

function canMoveTo(node: DisplayTreeNode, destinationPath: string): boolean {
  const sourceParentPath = actionParentPath(node);
  if (sourceParentPath === destinationPath) {
    return false;
  }
  return !(
    node.kind === 'directory' &&
    (destinationPath === node.path || destinationPath.startsWith(`${node.path}/`))
  );
}

function beginPointerDrag(event: PointerEvent, node: DisplayTreeNode): void {
  if (event.button !== 0 || store.isDemo || (node.kind === 'file' && node.category === 'other')) {
    return;
  }
  endDrag();
  pointerDrag = {
    node,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
}

function endDrag(): void {
  if (pointerFrame !== undefined) {
    globalThis.cancelAnimationFrame(pointerFrame);
    pointerFrame = undefined;
  }
  pointerDrag = null;
  pendingPointerPosition = null;
  draggingNode.value = null;
  dropTargetPath.value = null;
  dropTargetState.value = 'none';
  document.body.classList.remove('tree-dragging', 'tree-dragging--valid', 'tree-dragging--invalid');
}

function findDropTarget(x: number, y: number, node: DisplayTreeNode): DropTarget {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tree-kind]');
  if (!target) {
    return { path: null, state: 'none' };
  }
  if (target.dataset.treeKind !== 'directory') {
    return { path: null, state: 'invalid' };
  }
  const path = target.dataset.treePath;
  if (path === undefined || !canMoveTo(node, path)) {
    return { path: null, state: 'invalid' };
  }
  return { path, state: 'valid' };
}

function updateDragCursor(state: DropTargetState): void {
  document.body.classList.toggle('tree-dragging--valid', state === 'valid');
  document.body.classList.toggle('tree-dragging--invalid', state === 'invalid');
}

function updateDropTarget(x: number, y: number): void {
  if (!pointerDrag?.moved) {
    return;
  }
  const target = findDropTarget(x, y, pointerDrag.node);
  if (dropTargetPath.value !== target.path) {
    dropTargetPath.value = target.path;
  }
  if (dropTargetState.value !== target.state) {
    dropTargetState.value = target.state;
    updateDragCursor(target.state);
  }
}

function scheduleDropTargetUpdate(x: number, y: number): void {
  pendingPointerPosition = { x, y };
  if (pointerFrame !== undefined) {
    return;
  }
  pointerFrame = globalThis.requestAnimationFrame(() => {
    pointerFrame = undefined;
    const position = pendingPointerPosition;
    pendingPointerPosition = null;
    if (position) {
      updateDropTarget(position.x, position.y);
    }
  });
}

function handlePointerMove(event: PointerEvent): void {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
    return;
  }
  if (!pointerDrag.moved) {
    const distance = Math.hypot(
      event.clientX - pointerDrag.startX,
      event.clientY - pointerDrag.startY,
    );
    if (distance < 6) {
      return;
    }
    pointerDrag.moved = true;
    draggingNode.value = pointerDrag.node;
    document.body.classList.add('tree-dragging');
  }
  event.preventDefault();
  scheduleDropTargetUpdate(event.clientX, event.clientY);
}

function completePointerDrag(event: PointerEvent): void {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
    return;
  }
  const { moved, node } = pointerDrag;
  const target = moved
    ? findDropTarget(event.clientX, event.clientY, node)
    : { path: null, state: 'none' };
  endDrag();
  if (target.path === null) {
    return;
  }
  suppressDraggedClick = true;
  globalThis.setTimeout(() => {
    suppressDraggedClick = false;
  }, 160);
  void store.moveNode(node, target.path);
}

function cancelPointerDrag(event: PointerEvent): void {
  if (pointerDrag && event.pointerId === pointerDrag.pointerId) {
    endDrag();
  }
}

function preventDraggedClick(event: MouseEvent): void {
  if (!suppressDraggedClick) {
    return;
  }
  suppressDraggedClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (dialogKind.value) closeDialog();
    if (imagePreview.value) closeImagePreview();
    if (mediaPreview.value) closeMediaPreview();
    if (officeTarget.value) officeTarget.value = null;
    if (pdfTarget.value) pdfTarget.value = null;
  }
  contextMenu.value = null;
}

onMounted(() => {
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('click', preventDraggedClick, true);
  document.addEventListener('keydown', handleDocumentKeydown);
  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', completePointerDrag);
  document.addEventListener('pointercancel', cancelPointerDrag);
});

onBeforeUnmount(() => {
  endDrag();
  closeImagePreview();
  closeMediaPreview();
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('click', preventDraggedClick, true);
  document.removeEventListener('keydown', handleDocumentKeydown);
  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerup', completePointerDrag);
  document.removeEventListener('pointercancel', cancelPointerDrag);
});
</script>

<template>
  <section class="panel panel--explorer" aria-labelledby="explorer-title">
    <header class="panel__header">
      <h2 id="explorer-title" class="panel__title">资源管理器</h2>
      <div class="panel__actions">
        <button
          class="icon-button"
          type="button"
          aria-label="新建 Markdown 文件"
          title="新建 Markdown 文件"
          @click="openDialog('new-file')"
        >
          <FilePlus2 />
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="新建文件夹"
          title="新建文件夹"
          @click="openDialog('new-folder')"
        >
          <FolderPlus />
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="刷新工作空间"
          title="刷新工作空间"
          :disabled="store.refreshing"
          @click="refreshWorkspace"
        >
          <RefreshCw :class="{ 'animate-spin': store.refreshing }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="panel__body">
      <div
        v-if="store.treeRoot"
        class="tree"
        :class="{
          'tree--dragging': draggingNode,
        }"
        role="tree"
      >
        <div
          v-if="draggingNode && canMoveTo(draggingNode, '')"
          class="tree-root-drop-target"
          :class="{ 'tree-root-drop-target--active': dropTargetPath === '' }"
          data-tree-kind="directory"
          data-tree-path=""
        >
          移动到工作空间根目录
        </div>
        <FileTreeNode
          v-for="node in visibleRootChildren"
          :key="node.path"
          :node="node"
          :depth="0"
          :dragging-path="draggingNode?.path"
          :drop-target-path="dropTargetPath ?? undefined"
          @open="openNode"
          @toggle="toggleDirectory"
          @context="openContextMenu"
          @pointerdown="beginPointerDrag"
        />
        <button
          v-if="remainingRootCount"
          class="tree-row !h-8 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)]"
          type="button"
          role="treeitem"
          aria-level="1"
          :aria-label="`再显示 ${nextRootBatchSize} 项，剩余 ${remainingRootCount} 项`"
          data-tree-root-load-more
          @click="showMoreRootNodes"
        >
          <span class="tree-row__indent" />
          <span class="tree-row__icon">
            <ChevronsDown :size="15" aria-hidden="true" />
          </span>
          <span class="tree-row__name">
            再显示 {{ nextRootBatchSize }} 项（剩余 {{ remainingRootCount }} 项）
          </span>
        </button>
      </div>
    </div>

    <footer class="workspace-summary">
      <span>{{ documentCount }} 个文件</span>
      <span>·</span>
      <span>{{ directoryCount }} 个文件夹</span>
      <span v-if="store.indexing">· 正在索引</span>
    </footer>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="markdown-studio context-menu context-menu--explorer"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <template v-if="contextMenu.node.kind === 'directory'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openDialog('new-file', contextMenu.node)"
          >
            <FilePlus2 :size="16" />新建 Markdown 文件
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openDialog('new-folder', contextMenu.node)"
          >
            <FolderPlus :size="16" />新建文件夹
          </button>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            :disabled="store.refreshing"
            @click="refreshWorkspace"
          >
            <RotateCcw :size="16" :class="{ 'animate-spin': store.refreshing }" />刷新
          </button>
          <div class="context-menu__separator" />
        </template>
        <template
          v-else-if="contextMenu.node.category === 'image' && contextMenu.node.extension === '.psd'"
        >
          <p class="context-menu__label">PSD 查看</p>
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openPsdViewerInNewWindow(contextMenu.node)"
          >
            <BrandAdobePhotoshop :size="16" />使用 PSD 查看
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'image'">
          <p class="context-menu__label">图片工具</p>
          <button
            v-for="tool in IMAGE_TOOLS"
            :key="tool.id"
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openResourceTool(contextMenu.node, tool.id)"
          >
            <component :is="tool.icon" :size="16" aria-hidden="true" />{{ tool.label }}
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'pdf'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openBookInNewWindow(contextMenu.node)"
          >
            <Book :size="16" />使用仿真书打开
          </button>
          <p class="context-menu__label">PDF 工具</p>
          <button
            v-for="tool in PDF_TOOLS"
            :key="tool.id"
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="promptPdfTool(contextMenu.node, tool.id, tool.name)"
          >
            <ToolIcon :icon="tool.icon" :size="16" />{{ tool.name }}
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'book'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openBookInNewWindow(contextMenu.node)"
          >
            <Book :size="16" />使用仿真书打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template
          v-else-if="contextMenu.node.category === 'text' && contextMenu.node.extension === '.txt'"
        >
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openBookInNewWindow(contextMenu.node)"
          >
            <Book :size="16" />使用仿真书打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'draw'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openDrawInNewWindow(contextMenu.node)"
          >
            <Chalkboard :size="16" />使用白板打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'mind'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openMindInNewWindow(contextMenu.node)"
          >
            <Sitemap :size="16" />使用思维导图打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'sqlite'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openSqliteInNewWindow(contextMenu.node)"
          >
            <Database :size="16" />使用 SQLite Online 打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template
          v-else-if="contextMenu.node.category === 'audio' || contextMenu.node.category === 'video'"
        >
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="
              openMediaPreview(contextMenu.node);
              contextMenu = null;
            "
          >
            <Music v-if="contextMenu.node.category === 'audio'" :size="16" />
            <Video v-else :size="16" />
            播放
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="contextMenu.node.category === 'office'">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="
              officeTarget = contextMenu.node;
              contextMenu = null;
            "
          >
            <FileDescription :size="16" />使用 Office 打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="isMermaidDocumentNode(contextMenu.node)">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openMermaidInNewWindow(contextMenu.node)"
          >
            <ChartDots3 :size="16" />使用 Mermaid 打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <template v-else-if="isJsonDocumentNode(contextMenu.node)">
          <button
            class="context-menu__item"
            type="button"
            role="menuitem"
            @click="openJsonInNewWindow(contextMenu.node)"
          >
            <Braces :size="16" />使用 JSON 编辑器打开
          </button>
          <div class="context-menu__separator" />
        </template>
        <button
          class="context-menu__item"
          type="button"
          role="menuitem"
          @click="openDialog('rename', contextMenu.node)"
        >
          <Pencil :size="16" />重命名
        </button>
        <button
          class="context-menu__item context-menu__item--danger"
          type="button"
          role="menuitem"
          @click="openDialog('delete', contextMenu.node)"
        >
          <Trash2 :size="16" />删除
        </button>
      </div>

      <div
        v-if="pdfTarget"
        class="markdown-studio modal-backdrop"
        role="presentation"
        @mousedown.self="pdfTarget = null"
      >
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="pdf-open-title">
          <header class="modal__header">
            <h2 id="pdf-open-title">使用 PDF 工具打开</h2>
          </header>
          <div class="modal__body">
            <p class="m-0 text-[var(--color-text-muted)]">
              将请求“{{ pdfTarget.node.name }}”的本地读取权限，并在新窗口中使用“{{
                pdfTarget.label
              }}”打开。
            </p>
          </div>
          <footer class="modal__footer">
            <button
              class="secondary-button button--small"
              type="button"
              :disabled="pdfBusy"
              @click="pdfTarget = null"
            >
              取消
            </button>
            <button
              class="primary-button button--small"
              type="button"
              :disabled="pdfBusy"
              @click="confirmPdfTool"
            >
              {{ pdfBusy ? '正在授权…' : '授权并打开' }}
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="imagePreview"
        class="markdown-studio modal-backdrop"
        role="presentation"
        @mousedown.self="closeImagePreview"
      >
        <section
          class="modal image-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-preview-title"
        >
          <header class="modal__header">
            <h2 id="image-preview-title">{{ imagePreview.name }}</h2>
          </header>
          <div class="image-preview-dialog__body">
            <LoaderCircle
              v-if="imagePreview.loading"
              :size="30"
              class="animate-spin text-[var(--color-text-muted)]"
              aria-label="正在解析图片"
            />
            <img v-else-if="imagePreview.url" :src="imagePreview.url" :alt="imagePreview.name" />
          </div>
          <footer class="modal__footer">
            <button class="secondary-button button--small" type="button" @click="closeImagePreview">
              关闭
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="mediaPreview"
        class="markdown-studio modal-backdrop"
        role="presentation"
        @mousedown.self="closeMediaPreview"
      >
        <section
          class="modal media-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="media-preview-title"
        >
          <header class="modal__header">
            <h2 id="media-preview-title">{{ mediaPreview.name }}</h2>
          </header>
          <div class="media-preview-dialog__body">
            <audio
              v-if="mediaPreview.category === 'audio'"
              :src="mediaPreview.url"
              :aria-label="`播放 ${mediaPreview.name}`"
              controls
              preload="metadata"
              @loadedmetadata="mediaError = ''"
              @error="handleMediaError"
            />
            <video
              v-else
              :src="mediaPreview.url"
              :aria-label="`播放 ${mediaPreview.name}`"
              controls
              playsinline
              preload="metadata"
              @loadedmetadata="mediaError = ''"
              @error="handleMediaError"
            />
            <p v-if="mediaError" class="media-preview-dialog__error" role="alert">
              {{ mediaError }}
            </p>
          </div>
          <footer class="modal__footer">
            <button class="secondary-button button--small" type="button" @click="closeMediaPreview">
              关闭
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="officeTarget"
        class="markdown-studio modal-backdrop"
        role="presentation"
        @mousedown.self="officeTarget = null"
      >
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="office-open-title">
          <header class="modal__header">
            <h2 id="office-open-title">使用 Office 打开</h2>
          </header>
          <div class="modal__body">
            <p class="m-0 text-[var(--color-text-muted)]">
              将请求“{{ officeTarget.name }}”的本地读写权限，并在新窗口中打开 Office 编辑器。
            </p>
          </div>
          <footer class="modal__footer">
            <button
              class="secondary-button button--small"
              type="button"
              :disabled="officeBusy"
              @click="officeTarget = null"
            >
              取消
            </button>
            <button
              class="primary-button button--small"
              type="button"
              :disabled="officeBusy"
              @click="openOfficeInNewWindow"
            >
              {{ officeBusy ? '正在授权…' : '授权并打开' }}
            </button>
          </footer>
        </section>
      </div>

      <div
        v-if="dialogKind"
        class="markdown-studio modal-backdrop"
        role="presentation"
        @mousedown.self="closeDialog()"
      >
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`file-dialog-${dialogKind}`"
        >
          <header class="modal__header">
            <h2 :id="`file-dialog-${dialogKind}`">{{ dialogTitle }}</h2>
          </header>
          <div class="modal__body">
            <p v-if="dialogDescription" class="m-0 text-[var(--color-text-muted)]">
              {{ dialogDescription }}
            </p>
            <label v-if="dialogKind !== 'delete'" class="field mt-4">
              <span class="sr-only">名称</span>
              <input
                ref="dialogInput"
                v-model="dialogValue"
                type="text"
                autocomplete="off"
                placeholder="输入名称"
                @keydown.enter.prevent="submitDialog"
              />
            </label>
          </div>
          <footer class="modal__footer">
            <button class="secondary-button button--small" type="button" @click="closeDialog()">
              取消
            </button>
            <button
              :class="dialogKind === 'delete' ? 'danger-button' : 'primary-button'"
              class="button--small"
              type="button"
              :disabled="dialogBusy || (dialogKind !== 'delete' && !dialogValue.trim())"
              @click="submitDialog"
            >
              {{ dialogBusy ? '处理中…' : dialogKind === 'delete' ? '永久删除' : '确认' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>
