<script setup lang="ts">
import {
  ChevronDown,
  ChevronsDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "@lucide/vue";
import { computed, ref, watch } from "vue";
import type { DisplayTreeNode } from "@/stores/workspace";

defineOptions({ name: "FileTreeNode" });

const CHILD_BATCH_SIZE = 200;

const props = defineProps<{
  node: DisplayTreeNode;
  depth: number;
  activePath: string;
  expandedPaths: Set<string>;
}>();

const emit = defineEmits<{
  open: [node: DisplayTreeNode];
  toggle: [node: DisplayTreeNode];
  context: [event: MouseEvent, node: DisplayTreeNode];
}>();

const expanded = computed(() => props.expandedPaths.has(props.node.path));
const active = computed(
  () => props.node.kind === "file" && props.activePath === props.node.path,
);
const visibleChildCount = ref(CHILD_BATCH_SIZE);
const children = computed(() =>
  props.node.kind === "directory" ? (props.node.children ?? []) : [],
);
const visibleChildren = computed(() =>
  children.value.slice(0, visibleChildCount.value),
);
const remainingChildCount = computed(() =>
  Math.max(0, children.value.length - visibleChildren.value.length),
);
const nextBatchSize = computed(() =>
  Math.min(CHILD_BATCH_SIZE, remainingChildCount.value),
);

watch(
  [() => props.node.path, () => children.value.length],
  () => {
    visibleChildCount.value = CHILD_BATCH_SIZE;
  },
);
watch(expanded, (isExpanded) => {
  if (!isExpanded) {
    visibleChildCount.value = CHILD_BATCH_SIZE;
  }
});

function activate(): void {
  if (props.node.kind === "directory") {
    emit("toggle", props.node);
  } else {
    emit("open", props.node);
  }
}

function showMoreChildren(): void {
  visibleChildCount.value = Math.min(
    children.value.length,
    visibleChildCount.value + CHILD_BATCH_SIZE,
  );
}
</script>

<template>
  <div>
    <button
      class="tree-row"
      :class="{ 'tree-row--active': active }"
      type="button"
      role="treeitem"
      :aria-level="depth + 1"
      :style="{ paddingLeft: `${8 + depth * 17}px` }"
      :aria-expanded="node.kind === 'directory' ? expanded : undefined"
      :aria-current="active ? 'page' : undefined"
      @click="activate"
      @contextmenu.prevent="emit('context', $event, node)"
    >
      <span v-if="node.kind === 'directory'" class="tree-row__chevron">
        <ChevronDown v-if="expanded" :size="14" aria-hidden="true" />
        <ChevronRight v-else :size="14" aria-hidden="true" />
      </span>
      <span v-else class="tree-row__indent" />

      <span class="tree-row__icon">
        <FolderOpen
          v-if="node.kind === 'directory' && expanded"
          :size="17"
          aria-hidden="true"
        />
        <Folder
          v-else-if="node.kind === 'directory'"
          :size="17"
          aria-hidden="true"
        />
        <FileText v-else :size="16" aria-hidden="true" />
      </span>
      <span class="tree-row__name">{{ node.name }}</span>
    </button>

    <div v-if="node.kind === 'directory' && expanded" role="group">
      <FileTreeNode
        v-for="child in visibleChildren"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :active-path="activePath"
        :expanded-paths="expandedPaths"
        @open="emit('open', $event)"
        @toggle="emit('toggle', $event)"
        @context="(event, item) => emit('context', event, item)"
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
