<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  resizeMergeLayer,
  type MergeAsset,
  type MergeCorner,
  type MergeDocument,
  type MergeLayer,
} from '../../core/image/merge';

const props = defineProps<{
  value: MergeDocument;
  assets: ReadonlyMap<string, MergeAsset>;
  selectedId: string;
  disabled: boolean;
  panMode: boolean;
}>();
const emit = defineEmits<{
  select: [id: string];
  start: [];
  change: [layer: MergeLayer];
  end: [];
  cancel: [];
}>();

const stage = ref<HTMLDivElement | null>(null);
const zoom = ref(1);
const offset = ref({ x: 0, y: 0 });
const moving = ref(false);
const spaceHeld = ref(false);
const corners: MergeCorner[] = ['nw', 'ne', 'sw', 'se'];
const cornerNames = { nw: '左上', ne: '右上', sw: '左下', se: '右下' };
let observer: ResizeObserver | undefined;
let operation: {
  pointerId: number;
  x: number;
  y: number;
  offset: { x: number; y: number };
  layer?: MergeLayer;
  corner?: MergeCorner;
} | null = null;

const selected = computed(() => props.value.layers.find((layer) => layer.id === props.selectedId));
const surfaceStyle = computed(() => ({
  width: `${props.value.width}px`,
  height: `${props.value.height}px`,
  transform: `translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value})`,
  backgroundColor: props.value.background,
}));
const selectionStyle = computed(() => {
  const layer = selected.value;
  return layer
    ? {
        left: `${offset.value.x + layer.x * zoom.value}px`,
        top: `${offset.value.y + layer.y * zoom.value}px`,
        width: `${layer.width * zoom.value}px`,
        height: `${layer.height * zoom.value}px`,
      }
    : {};
});

function fit() {
  if (!stage.value || operation) return;
  const { clientWidth, clientHeight } = stage.value;
  zoom.value = Math.max(
    0.01,
    Math.min((clientWidth - 64) / props.value.width, (clientHeight - 64) / props.value.height, 1),
  );
  offset.value = {
    x: (clientWidth - props.value.width * zoom.value) / 2,
    y: (clientHeight - props.value.height * zoom.value) / 2,
  };
}

function setZoom(next: number, point?: { x: number; y: number }) {
  if (!stage.value || operation) return;
  const center = point ?? { x: stage.value.clientWidth / 2, y: stage.value.clientHeight / 2 };
  const clamped = Math.max(0.01, Math.min(8, next));
  const ratio = clamped / zoom.value;
  offset.value = {
    x: center.x - (center.x - offset.value.x) * ratio,
    y: center.y - (center.y - offset.value.y) * ratio,
  };
  zoom.value = clamped;
}

function viewportCenter() {
  return {
    x: ((stage.value?.clientWidth ?? 0) / 2 - offset.value.x) / zoom.value,
    y: ((stage.value?.clientHeight ?? 0) / 2 - offset.value.y) / zoom.value,
  };
}

function start(event: PointerEvent, layer?: MergeLayer, corner?: MergeCorner) {
  if (props.disabled || operation || (event.button !== 0 && event.button !== 1)) return;
  event.preventDefault();
  const pan = props.panMode || spaceHeld.value || event.button === 1 || !layer;
  stage.value?.focus({ preventScroll: true });
  stage.value?.setPointerCapture(event.pointerId);
  operation = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offset: { ...offset.value },
    layer: !pan && layer ? { ...layer } : undefined,
    corner: pan ? undefined : corner,
  };
  moving.value = true;
  if (!pan && layer) {
    emit('select', layer.id);
    emit('start');
  } else if (!layer && !props.panMode && !spaceHeld.value && event.button === 0) {
    emit('select', '');
  }
}

function move(event: PointerEvent) {
  if (!operation || operation.pointerId !== event.pointerId) return;
  const dx = event.clientX - operation.x;
  const dy = event.clientY - operation.y;
  if (!operation.layer) {
    offset.value = { x: operation.offset.x + dx, y: operation.offset.y + dy };
    return;
  }
  emit(
    'change',
    operation.corner
      ? resizeMergeLayer(operation.layer, operation.corner, dx / zoom.value, dy / zoom.value)
      : {
          ...operation.layer,
          x: operation.layer.x + dx / zoom.value,
          y: operation.layer.y + dy / zoom.value,
        },
  );
}

function finish(cancel = false) {
  if (!operation) return;
  const previous = operation;
  operation = null;
  moving.value = false;
  if (stage.value?.hasPointerCapture(previous.pointerId)) {
    stage.value.releasePointerCapture(previous.pointerId);
  }
  if (previous.layer) {
    if (cancel) emit('cancel');
    else emit('end');
  } else if (cancel) offset.value = previous.offset;
}

function wheel(event: WheelEvent) {
  if (props.disabled) return;
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return;
  setZoom(zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1), {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
}

function keydown(event: KeyboardEvent) {
  if (event.target !== stage.value) return;
  if (event.code === 'Space') {
    event.preventDefault();
    spaceHeld.value = true;
  } else if (event.key === 'Escape') finish(true);
}

function resetInput() {
  spaceHeld.value = false;
  finish(true);
}

watch(() => [props.value.width, props.value.height], fit, { flush: 'post' });
onMounted(() => {
  observer = new ResizeObserver(fit);
  if (stage.value) observer.observe(stage.value);
  window.addEventListener('blur', resetInput);
  fit();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('blur', resetInput);
});
defineExpose({ fit, viewportCenter });
</script>

<template>
  <div class="merge-editor">
    <div
      ref="stage"
      class="merge-stage"
      :class="{ 'merge-stage--pan': panMode || spaceHeld, 'merge-stage--moving': moving }"
      tabindex="0"
      role="group"
      aria-label="图片合并画布。拖动图片调整位置，方向键微调，空格配合拖动平移画布。"
      @pointerdown="start($event)"
      @pointermove="move"
      @pointerup="finish()"
      @pointercancel="finish(true)"
      @lostpointercapture="finish()"
      @wheel.prevent="wheel"
      @keydown="keydown"
      @keyup.space="spaceHeld = false"
      @blur="spaceHeld = false"
    >
      <div class="merge-surface" :style="surfaceStyle">
        <div v-if="value.background === 'transparent'" class="merge-transparency" />
        <img
          v-for="layer in value.layers"
          :key="layer.id"
          :src="assets.get(layer.id)?.previewUrl"
          :alt="assets.get(layer.id)?.name ?? '图片'"
          draggable="false"
          class="merge-image"
          :style="{
            left: `${layer.x}px`,
            top: `${layer.y}px`,
            width: `${layer.width}px`,
            height: `${layer.height}px`,
          }"
          @pointerdown.stop="start($event, layer)"
        />
      </div>
      <div v-if="selected" class="merge-selection" :style="selectionStyle">
        <button
          v-for="corner in corners"
          :key="corner"
          type="button"
          class="merge-handle"
          :class="`merge-handle--${corner}`"
          :aria-label="`从${cornerNames[corner]}角等比缩放图片，可通过右侧宽高输入框精确调整`"
          :disabled="disabled || panMode"
          @pointerdown.stop="start($event, selected, corner)"
        />
      </div>
    </div>
    <div class="merge-viewport-bar">
      <span>{{ value.width }} × {{ value.height }} px</span>
      <div>
        <button type="button" aria-label="缩小画布" @click="setZoom(zoom / 1.25)">−</button>
        <button type="button" title="原始尺寸显示" @click="setZoom(1)">
          {{ Math.round(zoom * 100) }}%
        </button>
        <button type="button" aria-label="放大画布" @click="setZoom(zoom * 1.25)">+</button>
        <button type="button" @click="fit">适应窗口</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.merge-editor {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}
.merge-stage {
  position: relative;
  height: clamp(400px, 62vh, 760px);
  overflow: hidden;
  background: var(--surface-subtle);
  touch-action: none;
  user-select: none;
  cursor: default;
}
.merge-stage:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -3px;
}
.merge-surface {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--border-strong),
    0 6px 28px #0002;
}
.merge-transparency {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: #fff;
  background-image: conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0);
  background-size: 24px 24px;
}
.merge-image {
  position: absolute;
  max-width: none;
  max-height: none;
  cursor: move;
}
.merge-selection {
  position: absolute;
  box-sizing: border-box;
  border: 1.5px solid var(--primary);
  pointer-events: none;
}
.merge-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 2px solid var(--primary);
  border-radius: 4px;
  background: var(--surface);
  pointer-events: auto;
  transform: translate(-50%, -50%);
  touch-action: none;
}
.merge-handle::after {
  content: '';
  position: absolute;
  inset: -9px;
}
.merge-handle--nw {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}
.merge-handle--ne {
  left: 100%;
  top: 0;
  cursor: nesw-resize;
}
.merge-handle--sw {
  left: 0;
  top: 100%;
  cursor: nesw-resize;
}
.merge-handle--se {
  left: 100%;
  top: 100%;
  cursor: nwse-resize;
}
.merge-stage--pan,
.merge-stage--pan .merge-image {
  cursor: grab;
}
.merge-stage--moving,
.merge-stage--moving .merge-image {
  cursor: grabbing;
}
.merge-viewport-bar,
.merge-viewport-bar > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.merge-viewport-bar {
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
}
.merge-viewport-bar button {
  min-height: 32px;
  min-width: 32px;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 4px 8px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.merge-viewport-bar button:hover {
  background: var(--primary-soft-hover);
}
@media (max-width: 700px) {
  .merge-stage {
    height: max(360px, 55svh);
  }
}
</style>
