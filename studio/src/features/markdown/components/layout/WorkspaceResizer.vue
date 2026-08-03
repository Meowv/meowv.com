<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { type LayoutWidthKey, useWorkspaceStore } from '@/features/markdown/stores/workspace';

const props = defineProps<{ target: LayoutWidthKey; label: string }>();
const store = useWorkspaceStore();
const SIDEBAR_HIDE_THRESHOLD = 116;
const SIDEBAR_REOPEN_WIDTH = 144;
let pointerId: number | null = null;
let startX = 0;
let startWidth = 0;

function onPointerMove(event: PointerEvent): void {
  if (pointerId !== event.pointerId) {
    return;
  }

  const nextWidth = startWidth + event.clientX - startX;
  if (props.target === 'sidebarWidth' && nextWidth <= SIDEBAR_HIDE_THRESHOLD) {
    store.setLayoutWidth('sidebarWidth', SIDEBAR_REOPEN_WIDTH);
    store.sidebarOpen = false;
    return;
  }
  store.setLayoutWidth(props.target, nextWidth);
}

function finishResize(): void {
  pointerId = null;
  document.body.classList.remove('workspace-resizing');
  void store.persistLayoutWidths();
}

function stopResize(event: PointerEvent): void {
  if (pointerId !== event.pointerId) {
    return;
  }
  finishResize();
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) {
    return;
  }
  pointerId = event.pointerId;
  startX = event.clientX;
  startWidth = store.preferences[props.target];
  event.currentTarget.setPointerCapture(event.pointerId);
  document.body.classList.add('workspace-resizing');
}

onBeforeUnmount(finishResize);
</script>

<template>
  <div
    class="workspace-resizer"
    :class="`workspace-resizer--${target === 'sidebarWidth' ? 'sidebar' : 'editor'}`"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    @pointerdown.prevent="startResize"
    @pointermove="onPointerMove"
    @pointerup="stopResize"
    @pointercancel="stopResize"
    @lostpointercapture="stopResize"
  >
    <span aria-hidden="true" />
  </div>
</template>
