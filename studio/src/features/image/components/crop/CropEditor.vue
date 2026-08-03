<script setup lang="ts">
import { Move, ZoomIn } from '@/features/image/icons';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { SourceRect } from '@/features/image/types/image';

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
type PointerAction = 'move' | ResizeHandle;

interface PointerOperation {
  action: PointerAction;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRect: SourceRect;
}

const props = withDefaults(
  defineProps<{
    src: string;
    sourceWidth: number;
    sourceHeight: number;
    modelValue: SourceRect;
    aspectRatio: number | null;
    zoom: number;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: SourceRect];
  'update:zoom': [value: number];
}>();

const stageRef = ref<HTMLElement | null>(null);
const stageWidth = ref(0);
const stageHeight = ref(0);
const activeOperation = ref<PointerOperation | null>(null);
let resizeObserver: ResizeObserver | null = null;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const imageBox = computed(() => {
  const width = Math.max(stageWidth.value, 1);
  const height = Math.max(stageHeight.value, 1);
  const padding = Math.min(32, Math.max(16, width * 0.04));
  const availableWidth = Math.max(width - padding * 2, 1);
  const availableHeight = Math.max(height - padding * 2, 1);
  const scale = Math.min(
    availableWidth / Math.max(props.sourceWidth, 1),
    availableHeight / Math.max(props.sourceHeight, 1),
  );
  const renderedWidth = props.sourceWidth * scale;
  const renderedHeight = props.sourceHeight * scale;

  return {
    left: (width - renderedWidth) / 2,
    top: (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
    scale,
  };
});

const normalizedRect = computed<SourceRect>(() => {
  const width = clamp(props.modelValue.width, 1, props.sourceWidth);
  const height = clamp(props.modelValue.height, 1, props.sourceHeight);

  return {
    x: clamp(props.modelValue.x, 0, props.sourceWidth - width),
    y: clamp(props.modelValue.y, 0, props.sourceHeight - height),
    width,
    height,
  };
});

const imageStyle = computed(() => ({
  left: `${imageBox.value.left}px`,
  top: `${imageBox.value.top}px`,
  width: `${imageBox.value.width}px`,
  height: `${imageBox.value.height}px`,
}));

const cropStyle = computed(() => ({
  left: `${imageBox.value.left + normalizedRect.value.x * imageBox.value.scale}px`,
  top: `${imageBox.value.top + normalizedRect.value.y * imageBox.value.scale}px`,
  width: `${normalizedRect.value.width * imageBox.value.scale}px`,
  height: `${normalizedRect.value.height * imageBox.value.scale}px`,
}));

const zoomPercent = computed(() => Math.round(props.zoom * 100));
const cropStatus = computed(() => {
  const rect = normalizedRect.value;

  return `裁剪区域：X ${Math.round(rect.x)} 像素，Y ${Math.round(rect.y)} 像素，宽 ${Math.round(rect.width)} 像素，高 ${Math.round(rect.height)} 像素。`;
});

function updateStageSize() {
  if (!stageRef.value) {
    return;
  }

  stageWidth.value = stageRef.value.clientWidth;
  stageHeight.value = stageRef.value.clientHeight;
}

function emitRect(rect: SourceRect) {
  emit('update:modelValue', {
    x: clamp(rect.x, 0, Math.max(0, props.sourceWidth - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, props.sourceHeight - rect.height)),
    width: clamp(rect.width, 1, props.sourceWidth),
    height: clamp(rect.height, 1, props.sourceHeight),
  });
}

function startPointer(event: PointerEvent, action: PointerAction) {
  if (props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) {
    return;
  }

  event.preventDefault();
  const stage = stageRef.value;
  if (!stage) {
    return;
  }

  stage.setPointerCapture(event.pointerId);
  activeOperation.value = {
    action,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRect: { ...normalizedRect.value },
  };
}

function moveRect(operation: PointerOperation, deltaX: number, deltaY: number) {
  const { startRect } = operation;
  emitRect({
    ...startRect,
    x: clamp(startRect.x + deltaX, 0, props.sourceWidth - startRect.width),
    y: clamp(startRect.y + deltaY, 0, props.sourceHeight - startRect.height),
  });
}

function resizeFree(operation: PointerOperation, deltaX: number, deltaY: number) {
  const { action, startRect } = operation;
  const minimumWidth = Math.min(props.sourceWidth, Math.max(1, 44 / imageBox.value.scale));
  const minimumHeight = Math.min(props.sourceHeight, Math.max(1, 44 / imageBox.value.scale));

  let left = startRect.x;
  let top = startRect.y;
  let right = startRect.x + startRect.width;
  let bottom = startRect.y + startRect.height;

  if (action.includes('w')) {
    left = clamp(startRect.x + deltaX, 0, right - minimumWidth);
  } else {
    right = clamp(startRect.x + startRect.width + deltaX, left + minimumWidth, props.sourceWidth);
  }

  if (action.includes('n')) {
    top = clamp(startRect.y + deltaY, 0, bottom - minimumHeight);
  } else {
    bottom = clamp(
      startRect.y + startRect.height + deltaY,
      top + minimumHeight,
      props.sourceHeight,
    );
  }

  emitRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
}

function resizeFixed(operation: PointerOperation, deltaX: number, deltaY: number) {
  const { action, startRect } = operation;
  const ratio = props.aspectRatio;
  if (!ratio) {
    return;
  }

  const expandsRight = action.includes('e');
  const expandsDown = action.includes('s');
  const anchorX = expandsRight ? startRect.x : startRect.x + startRect.width;
  const anchorY = expandsDown ? startRect.y : startRect.y + startRect.height;
  const movingX = (expandsRight ? startRect.x + startRect.width : startRect.x) + deltaX;
  const movingY = (expandsDown ? startRect.y + startRect.height : startRect.y) + deltaY;
  const rawWidth = Math.max(0, (movingX - anchorX) * (expandsRight ? 1 : -1));
  const rawHeight = Math.max(0, (movingY - anchorY) * (expandsDown ? 1 : -1));

  const widthDelta = Math.abs(rawWidth - startRect.width);
  const heightDelta = Math.abs(rawHeight - startRect.height) * ratio;
  const desiredWidth = widthDelta >= heightDelta ? rawWidth : rawHeight * ratio;
  const maxWidthByX = expandsRight ? props.sourceWidth - anchorX : anchorX;
  const maxHeightByY = expandsDown ? props.sourceHeight - anchorY : anchorY;
  const maximumWidth = Math.max(1, Math.min(maxWidthByX, maxHeightByY * ratio));
  const minimumWidth = Math.min(
    maximumWidth,
    Math.max(1, 44 / imageBox.value.scale, (44 / imageBox.value.scale) * ratio),
  );
  const width = clamp(desiredWidth, minimumWidth, maximumWidth);
  const height = width / ratio;

  emitRect({
    x: expandsRight ? anchorX : anchorX - width,
    y: expandsDown ? anchorY : anchorY - height,
    width,
    height,
  });
}

function onPointerMove(event: PointerEvent) {
  const operation = activeOperation.value;
  if (!operation || operation.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const scale = Math.max(imageBox.value.scale, Number.EPSILON);
  const deltaX = (event.clientX - operation.startClientX) / scale;
  const deltaY = (event.clientY - operation.startClientY) / scale;

  if (operation.action === 'move') {
    moveRect(operation, deltaX, deltaY);
  } else if (props.aspectRatio) {
    resizeFixed(operation, deltaX, deltaY);
  } else {
    resizeFree(operation, deltaX, deltaY);
  }
}

function finishPointer(event: PointerEvent) {
  const operation = activeOperation.value;
  if (!operation || operation.pointerId !== event.pointerId) {
    return;
  }

  const stage = stageRef.value;
  if (stage?.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }
  activeOperation.value = null;
}

function onLostPointerCapture(event: PointerEvent) {
  if (activeOperation.value?.pointerId === event.pointerId) {
    activeOperation.value = null;
  }
}

function onFrameKeydown(event: KeyboardEvent) {
  if (props.disabled) {
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  let deltaX = 0;
  let deltaY = 0;

  if (event.key === 'ArrowLeft') deltaX = -step;
  if (event.key === 'ArrowRight') deltaX = step;
  if (event.key === 'ArrowUp') deltaY = -step;
  if (event.key === 'ArrowDown') deltaY = step;
  if (!deltaX && !deltaY) {
    return;
  }

  event.preventDefault();
  const rect = normalizedRect.value;
  emitRect({
    ...rect,
    x: clamp(rect.x + deltaX, 0, props.sourceWidth - rect.width),
    y: clamp(rect.y + deltaY, 0, props.sourceHeight - rect.height),
  });
}

function resizeHandleLabel(handle: ResizeHandle): string {
  const labels: Record<ResizeHandle, string> = {
    nw: '左上角',
    ne: '右上角',
    sw: '左下角',
    se: '右下角',
  };

  return labels[handle];
}

function onHandleKeydown(event: KeyboardEvent, handle: ResizeHandle) {
  if (props.disabled) {
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  let deltaX = 0;
  let deltaY = 0;

  if (event.key === 'ArrowLeft') deltaX = -step;
  if (event.key === 'ArrowRight') deltaX = step;
  if (event.key === 'ArrowUp') deltaY = -step;
  if (event.key === 'ArrowDown') deltaY = step;
  if (!deltaX && !deltaY) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const operation: PointerOperation = {
    action: handle,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startRect: { ...normalizedRect.value },
  };

  if (props.aspectRatio) {
    resizeFixed(operation, deltaX, deltaY);
  } else {
    resizeFree(operation, deltaX, deltaY);
  }
}

function onZoomInput(event: Event) {
  const nextZoom = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(nextZoom) || nextZoom === props.zoom) {
    return;
  }

  const rect = normalizedRect.value;
  const factor = props.zoom / nextZoom;
  let width = rect.width * factor;
  let height = rect.height * factor;
  const minimumWidth = Math.min(props.sourceWidth, Math.max(1, 44 / imageBox.value.scale));
  const minimumHeight = Math.min(props.sourceHeight, Math.max(1, 44 / imageBox.value.scale));

  const fitFactor = Math.min(
    1,
    props.sourceWidth / Math.max(width, 1),
    props.sourceHeight / Math.max(height, 1),
  );
  width *= fitFactor;
  height *= fitFactor;

  const currentRatio = props.aspectRatio ?? rect.width / Math.max(rect.height, 1);
  if (width < minimumWidth) {
    width = minimumWidth;
    height = width / currentRatio;
  }
  if (height < minimumHeight) {
    height = minimumHeight;
    width = height * currentRatio;
  }

  const finalFitFactor = Math.min(
    1,
    props.sourceWidth / Math.max(width, 1),
    props.sourceHeight / Math.max(height, 1),
  );
  width *= finalFitFactor;
  height *= finalFitFactor;

  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  emitRect({
    x: clamp(centerX - width / 2, 0, props.sourceWidth - width),
    y: clamp(centerY - height / 2, 0, props.sourceHeight - height),
    width,
    height,
  });
  emit('update:zoom', nextZoom);
}

watch(
  () => [props.sourceWidth, props.sourceHeight, props.src],
  async () => {
    await nextTick();
    updateStageSize();
  },
);

watch(
  () => props.disabled,
  (disabled) => {
    const operation = activeOperation.value;
    const stage = stageRef.value;
    if (!disabled || !operation) {
      return;
    }
    if (stage?.hasPointerCapture(operation.pointerId)) {
      stage.releasePointerCapture(operation.pointerId);
    }
    activeOperation.value = null;
  },
);

onMounted(() => {
  updateStageSize();
  if (typeof ResizeObserver !== 'undefined' && stageRef.value) {
    resizeObserver = new ResizeObserver(updateStageSize);
    resizeObserver.observe(stageRef.value);
  } else {
    window.addEventListener('resize', updateStageSize);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', updateStageSize);

  const operation = activeOperation.value;
  const stage = stageRef.value;
  if (operation && stage?.hasPointerCapture(operation.pointerId)) {
    stage.releasePointerCapture(operation.pointerId);
  }
  activeOperation.value = null;
});
</script>

<template>
  <div class="space-y-4">
    <div
      ref="stageRef"
      class="crop-stage relative isolate min-h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-inner sm:min-h-[420px]"
      @pointermove="onPointerMove"
      @pointerup="finishPointer"
      @pointercancel="finishPointer"
      @lostpointercapture="onLostPointerCapture"
    >
      <div class="pointer-events-none absolute select-none overflow-hidden" :style="imageStyle">
        <img
          class="block h-full w-full object-fill"
          :src="src"
          alt="待裁剪图片预览"
          draggable="false"
        />
      </div>

      <div
        class="crop-frame group absolute z-10 border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.45)]"
        :class="{
          'cursor-grabbing': activeOperation?.action === 'move',
          'cursor-grab': activeOperation?.action !== 'move',
          'pointer-events-none opacity-70': disabled,
        }"
        :style="cropStyle"
        role="group"
        tabindex="0"
        :aria-label="cropStatus"
        aria-describedby="crop-keyboard-help"
        @keydown="onFrameKeydown"
        @pointerdown="startPointer($event, 'move')"
      >
        <span class="crop-grid crop-grid-horizontal crop-grid-first" />
        <span class="crop-grid crop-grid-horizontal crop-grid-second" />
        <span class="crop-grid crop-grid-vertical crop-grid-first" />
        <span class="crop-grid crop-grid-vertical crop-grid-second" />

        <span class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            class="rounded-full border border-white/50 bg-slate-950/55 p-1.5 text-white opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100"
          >
            <Move :size="16" aria-hidden="true" />
          </span>
        </span>

        <button
          v-for="handle in ['nw', 'ne', 'sw', 'se'] as ResizeHandle[]"
          :key="handle"
          type="button"
          class="crop-handle"
          :class="`crop-handle-${handle}`"
          :aria-label="`${resizeHandleLabel(handle)}控制点，使用方向键调整裁剪区域，按住 Shift 可加速`"
          aria-describedby="crop-status"
          :disabled="disabled"
          @keydown="onHandleKeydown($event, handle)"
          @pointerdown.stop="startPointer($event, handle)"
        />
      </div>
    </div>

    <p id="crop-keyboard-help" class="sr-only">
      使用方向键移动裁剪区域，按住 Shift 每次移动 10 像素；聚焦四角控制点后可用方向键调整大小。
    </p>
    <p id="crop-status" class="sr-only" aria-live="polite" aria-atomic="true">
      {{ cropStatus }}
    </p>

    <div
      class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900"
    >
      <div class="flex shrink-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <ZoomIn :size="17" aria-hidden="true" />
        <span class="font-medium">画面缩放</span>
      </div>
      <input
        class="crop-range min-w-0 flex-1"
        type="range"
        min="1"
        max="4"
        step="0.05"
        :value="zoom"
        :disabled="disabled"
        aria-label="画面缩放比例"
        :aria-valuetext="`${zoomPercent}%`"
        @input="onZoomInput"
      />
      <output class="w-12 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
        {{ zoomPercent }}%
      </output>
    </div>
  </div>
</template>

<style scoped>
.crop-stage {
  background-color: #0f172a;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.crop-frame {
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.48),
    0 0 0 9999px rgba(2, 6, 23, 0.58);
  touch-action: none;
}

.crop-frame:focus-visible {
  outline: 3px solid #818cf8;
  outline-offset: 3px;
}

.crop-grid {
  pointer-events: none;
  position: absolute;
  background: rgba(255, 255, 255, 0.45);
}

.crop-grid-horizontal {
  left: 0;
  right: 0;
  height: 1px;
}

.crop-grid-vertical {
  bottom: 0;
  top: 0;
  width: 1px;
}

.crop-grid-horizontal.crop-grid-first {
  top: 33.333%;
}

.crop-grid-horizontal.crop-grid-second {
  top: 66.666%;
}

.crop-grid-vertical.crop-grid-first {
  left: 33.333%;
}

.crop-grid-vertical.crop-grid-second {
  left: 66.666%;
}

.crop-handle {
  position: absolute;
  z-index: 2;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  touch-action: none;
}

.crop-handle::after {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 3px;
  background: #7c3aed;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.4);
  content: '';
}

.crop-handle:focus-visible {
  outline: 3px solid #818cf8;
  outline-offset: 2px;
}

.crop-handle:disabled {
  cursor: not-allowed;
}

.crop-handle-nw {
  top: -12px;
  left: -12px;
  cursor: nwse-resize;
}

.crop-handle-ne {
  top: -12px;
  right: -12px;
  cursor: nesw-resize;
}

.crop-handle-sw {
  bottom: -12px;
  left: -12px;
  cursor: nesw-resize;
}

.crop-handle-se {
  right: -12px;
  bottom: -12px;
  cursor: nwse-resize;
}

.crop-range {
  height: 4px;
  accent-color: #4f46e5;
  cursor: pointer;
}

.crop-range:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .crop-stage {
    min-height: 300px;
  }

  .crop-handle {
    width: 32px;
    height: 32px;
  }

  .crop-handle::after {
    top: 9px;
    left: 9px;
    width: 14px;
    height: 14px;
  }

  .crop-handle-nw {
    top: -16px;
    left: -16px;
  }

  .crop-handle-ne {
    top: -16px;
    right: -16px;
  }

  .crop-handle-sw {
    bottom: -16px;
    left: -16px;
  }

  .crop-handle-se {
    right: -16px;
    bottom: -16px;
  }
}
</style>
