<script setup lang="ts">
import { type LayoutWidthKey, useWorkspaceStore } from "@/stores/workspace";

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
  if (
    props.target === "sidebarWidth" &&
    nextWidth <= SIDEBAR_HIDE_THRESHOLD
  ) {
    store.setLayoutWidth("sidebarWidth", SIDEBAR_REOPEN_WIDTH);
    store.sidebarOpen = false;
    return;
  }
  store.setLayoutWidth(props.target, nextWidth);
}

function stopResize(event: PointerEvent): void {
  if (pointerId !== event.pointerId) {
    return;
  }
  pointerId = null;
  document.body.classList.remove("workspace-resizing");
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", stopResize);
  document.removeEventListener("pointercancel", stopResize);
  void store.persistLayoutWidths();
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  pointerId = event.pointerId;
  startX = event.clientX;
  startWidth = store.preferences[props.target];
  document.body.classList.add("workspace-resizing");
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", stopResize);
  document.addEventListener("pointercancel", stopResize);
}
</script>

<template>
  <div
    class="workspace-resizer"
    :class="`workspace-resizer--${target === 'sidebarWidth' ? 'sidebar' : 'editor'}`"
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    @pointerdown.prevent="startResize"
  >
    <span aria-hidden="true" />
  </div>
</template>
