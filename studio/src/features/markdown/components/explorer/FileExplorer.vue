<script setup lang="ts">
import {
  ChevronsDown,
  FilePlus2,
  FolderPlus,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from '@/features/markdown/icons';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import FileTreeNode from './FileTreeNode.vue';
import { useWorkspaceStore, type DisplayTreeNode } from '@/features/markdown/stores/workspace';

type DialogKind = 'new-file' | 'new-folder' | 'rename' | 'delete';
const ROOT_BATCH_SIZE = 200;

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
let pointerDrag: PointerDragState | null = null;
let suppressDraggedClick = false;
let pointerFrame: number | undefined;
let pendingPointerPosition: { x: number; y: number } | null = null;
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
  for (let index = 1; index <= segments.length; index += 1) {
    next.add(segments.slice(0, index).join('/'));
  }
  expandedPaths.value = next;
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
  const menuWidth = 188;
  const menuHeight = node.kind === 'directory' ? 184 : 80;
  contextMenu.value = {
    x: Math.min(event.clientX, globalThis.innerWidth - menuWidth),
    y: Math.min(event.clientY, globalThis.innerHeight - menuHeight),
    node,
  };
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
  if (event.button !== 0 || store.isDemo) {
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
  if (event.key === 'Escape' && dialogKind.value) {
    closeDialog();
    return;
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
  document.removeEventListener('click', closeContextMenu);
  document.removeEventListener('click', preventDraggedClick, true);
  document.removeEventListener('keydown', handleDocumentKeydown);
  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerup', completePointerDrag);
  document.removeEventListener('pointercancel', cancelPointerDrag);
});
</script>

<template>
  <section class="panel" aria-labelledby="explorer-title">
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
          :active-path="store.activePath"
          :expanded-paths="expandedPaths"
          :dragging-path="draggingNode?.path"
          :drop-target-path="dropTargetPath ?? undefined"
          @open="store.openDocument($event.path)"
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
      <span>{{ documentCount }} 个文档</span>
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
