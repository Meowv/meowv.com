<script setup lang="ts">
import {
  Book,
  ChevronDown,
  ChevronsDown,
  ChevronRight,
  BrandAdobePhotoshop,
  Database,
  Chalkboard,
  File,
  FileCode2,
  FileDescription,
  FileSpreadsheet,
  FileTypePdf,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Music,
  Presentation,
  Sitemap,
  Table2,
  Video,
} from '@/features/markdown/icons';
import { computed, inject, ref, watch } from 'vue';
import type { DisplayTreeNode } from '@/features/markdown/stores/workspace';
import { ACTIVE_TREE_PATH, EXPANDED_TREE_PATHS } from './tree-state';

defineOptions({ name: 'FileTreeNode' });

const CHILD_BATCH_SIZE = 200;
const CODE_EXTENSIONS = new Set([
  '.c',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.htm',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.jsonc',
  '.less',
  '.mjs',
  '.py',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
  '.webmanifest',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
]);

const props = defineProps<{
  node: DisplayTreeNode;
  depth: number;
  draggingPath?: string;
  dropTargetPath?: string;
}>();

const emit = defineEmits<{
  open: [node: DisplayTreeNode];
  toggle: [node: DisplayTreeNode];
  context: [event: MouseEvent, node: DisplayTreeNode];
  pointerdown: [event: PointerEvent, node: DisplayTreeNode];
}>();

const activePath = inject(ACTIVE_TREE_PATH, ref(''));
const expandedPaths = inject(EXPANDED_TREE_PATHS, ref(new Set<string>()));
const expanded = computed(() => expandedPaths.value.has(props.node.path));
const active = computed(() => props.node.kind === 'file' && activePath.value === props.node.path);
const unavailable = computed(() => props.node.kind === 'file' && props.node.category === 'other');
const fileIcon = computed(() => {
  if (props.node.category === 'markdown') return FileText;
  if (props.node.category === 'draw') return Chalkboard;
  if (props.node.category === 'mind') return Sitemap;
  if (props.node.extension === '.psd') return BrandAdobePhotoshop;
  if (props.node.category === 'image') return Image;
  if (props.node.category === 'audio') return Music;
  if (props.node.category === 'video') return Video;
  if (props.node.category === 'pdf') return FileTypePdf;
  if (props.node.category === 'book') return Book;
  if (props.node.category === 'sqlite') return Database;
  if (props.node.extension === '.xlsx') return FileSpreadsheet;
  if (props.node.extension === '.pptx') return Presentation;
  if (props.node.extension === '.csv') return Table2;
  if (props.node.category === 'office') return FileDescription;
  if (props.node.category === 'text' && CODE_EXTENSIONS.has(props.node.extension ?? '')) {
    return FileCode2;
  }
  if (props.node.category === 'text') return FileDescription;
  return File;
});
const visibleChildCount = ref(CHILD_BATCH_SIZE);
const children = computed(() =>
  props.node.kind === 'directory' ? (props.node.children ?? []) : [],
);
const visibleChildren = computed(() => children.value.slice(0, visibleChildCount.value));
const remainingChildCount = computed(() =>
  Math.max(0, children.value.length - visibleChildren.value.length),
);
const nextBatchSize = computed(() => Math.min(CHILD_BATCH_SIZE, remainingChildCount.value));

watch([() => props.node.path, () => children.value.length], () => {
  visibleChildCount.value = CHILD_BATCH_SIZE;
});
watch(expanded, (isExpanded) => {
  if (!isExpanded) {
    visibleChildCount.value = CHILD_BATCH_SIZE;
  }
});

function activate(): void {
  if (props.node.kind === 'directory') {
    emit('toggle', props.node);
  } else {
    if (!unavailable.value) {
      emit('open', props.node);
    }
  }
}

function showMoreChildren(): void {
  visibleChildCount.value = Math.min(
    children.value.length,
    visibleChildCount.value + CHILD_BATCH_SIZE,
  );
}

function onPointerDown(event: PointerEvent): void {
  const target = event.currentTarget;
  if (event.button === 0 && target instanceof HTMLButtonElement) {
    target.setPointerCapture(event.pointerId);
  }
  emit('pointerdown', event, props.node);
}
</script>

<template>
  <div>
    <button
      class="tree-row"
      :class="{
        'tree-row--active': active,
        'tree-row--dragging': draggingPath === node.path,
        'tree-row--drop-target': dropTargetPath === node.path,
        'tree-row--unavailable': unavailable,
      }"
      type="button"
      role="treeitem"
      :data-tree-path="node.path"
      :data-tree-kind="node.kind"
      :aria-level="depth + 1"
      :style="{ paddingLeft: `${8 + depth * 17}px` }"
      :aria-expanded="node.kind === 'directory' ? expanded : undefined"
      :aria-current="active ? 'page' : undefined"
      :aria-disabled="unavailable || undefined"
      @click="activate"
      @contextmenu.prevent="emit('context', $event, node)"
      @pointerdown="onPointerDown"
    >
      <span v-if="node.kind === 'directory'" class="tree-row__chevron">
        <ChevronDown v-if="expanded" :size="14" aria-hidden="true" />
        <ChevronRight v-else :size="14" aria-hidden="true" />
      </span>
      <span v-else class="tree-row__indent" />

      <span class="tree-row__icon">
        <FolderOpen v-if="node.kind === 'directory' && expanded" :size="17" aria-hidden="true" />
        <Folder v-else-if="node.kind === 'directory'" :size="17" aria-hidden="true" />
        <component :is="fileIcon" v-else :size="16" aria-hidden="true" />
      </span>
      <span class="tree-row__name">{{ node.name }}</span>
    </button>

    <div v-if="node.kind === 'directory' && expanded" role="group">
      <FileTreeNode
        v-for="child in visibleChildren"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :dragging-path="draggingPath"
        :drop-target-path="dropTargetPath"
        @open="emit('open', $event)"
        @toggle="emit('toggle', $event)"
        @context="(event, item) => emit('context', event, item)"
        @pointerdown="(event, item) => emit('pointerdown', event, item)"
      />
      <button
        v-if="remainingChildCount"
        class="tree-row !h-8 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-brand)]"
        type="button"
        role="treeitem"
        :aria-level="depth + 2"
        :aria-label="`再显示 ${nextBatchSize} 项，剩余 ${remainingChildCount} 项`"
        :style="{ paddingLeft: `${8 + (depth + 1) * 17}px` }"
        data-tree-load-more
        @click="showMoreChildren"
      >
        <span class="tree-row__indent" />
        <span class="tree-row__icon">
          <ChevronsDown :size="15" aria-hidden="true" />
        </span>
        <span class="tree-row__name">
          再显示 {{ nextBatchSize }} 项（剩余 {{ remainingChildCount }} 项）
        </span>
      </button>
    </div>
  </div>
</template>
