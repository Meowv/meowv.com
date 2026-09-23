<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconEye,
  IconPalette,
  IconPin,
  IconPinFilled,
  IconTrash,
} from '@tabler/icons-vue';
import NoteEditor from './NoteEditor.vue';
import NotePreview from './NotePreview.vue';
import {
  NOTE_COLOR_OPTIONS,
  NOTE_MAX_OPACITY,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_OPACITY,
  NOTE_MIN_WIDTH,
} from '@/features/notes/types';
import type { NoteSticky } from '@/features/notes/types';

const props = defineProps<{ note: NoteSticky }>();
const emit = defineEmits<{
  (e: 'update', id: string, patch: Partial<NoteSticky>): void;
  (e: 'save', id: string): void;
  (e: 'delete', id: string): void;
  (e: 'front', id: string): void;
  (e: 'shake', id: string): void;
}>();

const SHAKE_MIN_DISTANCE = 32;
const SHAKE_MIN_SPEED = 0.5;
const SHAKE_MAX_SEGMENT_DURATION = 140;
const SHAKE_REQUIRED_REVERSALS = 3;
let shakeAnchorX = 0;
let shakeAnchorY = 0;
let shakeAnchorTime = 0;
let shakeDirection = 0;
let shakeReversals = 0;
let shakeTriggered = false;

const rootRef = ref<HTMLElement | null>(null);
const colorMenuOpen = ref(false);
const opacityMenuOpen = ref(false);
const shakeFeedback = ref(false);
const sliderRef = ref<HTMLElement | null>(null);
let sliderDragging = false;
let layoutTransitionFrame: number | null = null;
const dragState = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  maxX: number;
  maxY: number;
} | null>(null);
let dragMoved = false;
const resizeState = ref<{
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  maxX: number;
  maxY: number;
  fromLeft: boolean;
} | null>(null);

watch(
  () => props.note.id,
  () => {
    colorMenuOpen.value = false;
    opacityMenuOpen.value = false;
  },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
  if (layoutTransitionFrame !== null) window.cancelAnimationFrame(layoutTransitionFrame);
});

function handleOutsidePointerDown(event: PointerEvent): void {
  const root = rootRef.value;
  if (!root || root.contains(event.target as Node)) return;
  colorMenuOpen.value = false;
  opacityMenuOpen.value = false;
}

const foreground = computed(() => {
  const color = props.note.color;
  const value = color.replace('#', '');
  if (value.length !== 6) return '#1f2937';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#1f2937' : '#ffffff';
});

const collapsedTitle = computed(() => {
  const firstLine = props.note.content.split('\n').find((line) => line.trim().length > 0) ?? '';
  return (
    firstLine
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/^#+\s*/, '')
      .replace(/[*_~`>|-]/g, '')
      .trim() || '空白便签'
  );
});

function cardStyle(): Record<string, string> {
  return {
    left: `${props.note.x}px`,
    top: `${props.note.y}px`,
    width: `${props.note.width}px`,
    height: `${props.note.height}px`,
    zIndex: String(props.note.zIndex),
    opacity: String(props.note.opacity),
    '--note-color': props.note.color,
    '--note-fg': foreground.value,
  };
}

function onHeaderPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('button')) return;
  const parent = rootRef.value?.parentElement;
  emit('front', props.note.id);
  dragMoved = false;
  resetShakeTracking(event.clientX, event.clientY, performance.now());
  shakeTriggered = false;
  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: props.note.x,
    startTop: props.note.y,
    maxX: parent?.clientWidth ?? 0,
    maxY: parent?.clientHeight ?? 0,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onHeaderPointerMove(event: PointerEvent): void {
  const state = dragState.value;
  if (!state || state.pointerId !== event.pointerId) return;
  if (!dragMoved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 6) {
    dragMoved = true;
  }
  if (!shakeTriggered) detectShakeTrigger(event);
  const keepVisible = 16;
  const x = state.startLeft + event.clientX - state.startX;
  const y = state.startTop + event.clientY - state.startY;
  const minX = Math.min(0, -(props.note.width - keepVisible));
  const maxX = Math.max(keepVisible, state.maxX - keepVisible);
  const minY = Math.min(0, -(props.note.height - keepVisible));
  const maxY = Math.max(keepVisible, state.maxY - keepVisible);
  emit('update', props.note.id, {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  });
}

function onHeaderPointerUp(event: PointerEvent): void {
  if (dragState.value?.pointerId !== event.pointerId) return;
  dragState.value = null;
  emit('save', props.note.id);
}

function onHeaderDoubleClick(event: MouseEvent): void {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  const target = event.target;
  if (target instanceof Element && target.closest('button')) return;
  toggleCollapsed();
}

function resetShakeTracking(x: number, y: number, time: number): void {
  shakeAnchorX = x;
  shakeAnchorY = y;
  shakeAnchorTime = time;
  shakeDirection = 0;
  shakeReversals = 0;
}

function detectShakeTrigger(event: PointerEvent): void {
  const now = performance.now();
  const dx = event.clientX - shakeAnchorX;
  const dy = event.clientY - shakeAnchorY;
  const distance = Math.abs(dx);
  if (distance < SHAKE_MIN_DISTANCE || distance <= Math.abs(dy)) return;

  const duration = now - shakeAnchorTime;
  if (duration > SHAKE_MAX_SEGMENT_DURATION || distance / Math.max(duration, 1) < SHAKE_MIN_SPEED) {
    resetShakeTracking(event.clientX, event.clientY, now);
    return;
  }

  const direction = dx > 0 ? 1 : -1;
  if (shakeDirection === 0) {
    shakeDirection = direction;
  } else if (direction !== shakeDirection) {
    shakeDirection = direction;
    shakeReversals += 1;
    if (shakeReversals >= SHAKE_REQUIRED_REVERSALS) {
      triggerShake();
      return;
    }
  }

  shakeAnchorX = event.clientX;
  shakeAnchorY = event.clientY;
  shakeAnchorTime = now;
}

function triggerShake(): void {
  shakeTriggered = true;
  dragMoved = true;
  shakeFeedback.value = true;
  window.setTimeout(() => {
    shakeFeedback.value = false;
  }, 420);
  emit('shake', props.note.id);
}

function onResizePointerDown(event: PointerEvent, fromLeft = false): void {
  event.preventDefault();
  event.stopPropagation();
  emit('front', props.note.id);
  const parent = rootRef.value?.parentElement;
  resizeState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startLeft: props.note.x,
    startTop: props.note.y,
    startWidth: props.note.width,
    startHeight: props.note.height,
    maxX: parent?.clientWidth ?? 0,
    maxY: parent?.clientHeight ?? 0,
    fromLeft,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onResizePointerMove(event: PointerEvent): void {
  const state = resizeState.value;
  if (!state || state.pointerId !== event.pointerId) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  const width = Math.max(NOTE_MIN_WIDTH, state.startWidth + (state.fromLeft ? -dx : dx));
  const height = Math.max(NOTE_MIN_HEIGHT, state.startHeight + dy);
  if (state.fromLeft) {
    const keepVisible = 16;
    const x = state.startLeft + state.startWidth - width;
    const minX = Math.min(0, -(width - keepVisible));
    const maxX = Math.max(keepVisible, state.maxX - keepVisible);
    emit('update', props.note.id, {
      width,
      height,
      x: Math.min(Math.max(x, minX), maxX),
    });
  } else {
    emit('update', props.note.id, { width, height });
  }
}

function onResizePointerUp(event: PointerEvent): void {
  if (resizeState.value?.pointerId !== event.pointerId) return;
  resizeState.value = null;
  emit('save', props.note.id);
}

function toggleCollapsed(): void {
  emit('update', props.note.id, { collapsed: !props.note.collapsed });
  emit('save', props.note.id);
}

function selectColor(color: string): void {
  emit('update', props.note.id, { color });
  colorMenuOpen.value = false;
  emit('save', props.note.id);
}

function toggleColorMenu(): void {
  colorMenuOpen.value = !colorMenuOpen.value;
  if (colorMenuOpen.value) opacityMenuOpen.value = false;
}

function toggleOpacityMenu(): void {
  opacityMenuOpen.value = !opacityMenuOpen.value;
  if (opacityMenuOpen.value) colorMenuOpen.value = false;
}

function toggleMode(): void {
  const mode = props.note.mode === 'edit' ? 'preview' : 'edit';
  emit('update', props.note.id, { mode });
  emit('save', props.note.id);
}

function sliderOpacityFromEvent(event: PointerEvent): number {
  const slider = sliderRef.value;
  if (!slider) return props.note.opacity;
  const rect = slider.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  const clamped = Math.min(NOTE_MAX_OPACITY, Math.max(NOTE_MIN_OPACITY, ratio));
  return Math.round(clamped * 100) / 100;
}

function onSliderPointerDown(event: PointerEvent): void {
  event.preventDefault();
  event.stopPropagation();
  sliderDragging = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit('update', props.note.id, { opacity: sliderOpacityFromEvent(event) });
}

function onSliderPointerMove(event: PointerEvent): void {
  if (!sliderDragging) return;
  emit('update', props.note.id, { opacity: sliderOpacityFromEvent(event) });
}

function onSliderPointerUp(): void {
  if (!sliderDragging) return;
  sliderDragging = false;
  emit('save', props.note.id);
}

function onSliderKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.1 : 0.05;
  let next = props.note.opacity;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    next += step;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    next -= step;
  } else if (event.key === 'Home') {
    next = NOTE_MIN_OPACITY;
  } else if (event.key === 'End') {
    next = NOTE_MAX_OPACITY;
  } else {
    return;
  }
  event.preventDefault();
  const clamped = Math.min(NOTE_MAX_OPACITY, Math.max(NOTE_MIN_OPACITY, next));
  emit('update', props.note.id, { opacity: Math.round(clamped * 100) / 100 });
  emit('save', props.note.id);
}

function togglePinned(): void {
  emit('update', props.note.id, { pinned: !props.note.pinned });
  emit('save', props.note.id);
}

function updateContent(value: string): void {
  emit('update', props.note.id, { content: value });
}

function setCarnivalTransform(x: number, y: number, rotation: number, scale = 1): void {
  rootRef.value?.style.setProperty(
    'transform',
    `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`,
  );
}

function clearCarnivalTransform(): void {
  rootRef.value?.style.removeProperty('transform');
}

function playLayoutTransition(deltaX: number, deltaY: number): void {
  if ((deltaX === 0 && deltaY === 0) || !rootRef.value) return;
  if (layoutTransitionFrame !== null) window.cancelAnimationFrame(layoutTransitionFrame);
  const root = rootRef.value;
  root.style.setProperty('transition', 'none');
  root.style.setProperty('transform', `translate3d(${deltaX}px, ${deltaY}px, 0)`);
  void root.offsetWidth;
  layoutTransitionFrame = window.requestAnimationFrame(() => {
    root.style.removeProperty('transition');
    root.style.removeProperty('transform');
    layoutTransitionFrame = null;
  });
}

defineExpose({ setCarnivalTransform, clearCarnivalTransform, playLayoutTransition });
</script>

<template>
  <article
    ref="rootRef"
    class="note-card"
    :class="{
      'note-card--collapsed': note.collapsed,
      'note-card--pinned': note.pinned,
      'note-card--shake': shakeFeedback,
    }"
    :style="cardStyle()"
    aria-label="便签"
  >
    <header
      class="note-card__header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @dblclick="onHeaderDoubleClick"
    >
      <button
        class="note-card__button"
        type="button"
        :title="note.collapsed ? '展开便签' : '折叠便签'"
        :aria-label="note.collapsed ? '展开便签' : '折叠便签'"
        @click.stop="toggleCollapsed"
      >
        <IconChevronDown v-if="note.collapsed" :size="14" />
        <IconChevronUp v-else :size="14" />
      </button>
      <span class="note-card__title">{{ collapsedTitle }}</span>
      <span class="note-card__actions">
        <button
          class="note-card__button"
          type="button"
          :title="note.mode === 'edit' ? '预览效果' : '编辑内容'"
          :aria-label="note.mode === 'edit' ? '预览效果' : '编辑内容'"
          :aria-pressed="note.mode === 'preview'"
          @click.stop="toggleMode"
        >
          <IconEye v-if="note.mode === 'edit'" :size="14" />
          <IconEdit v-else :size="14" />
        </button>
        <span class="note-card__menu-anchor" @pointerdown.stop>
          <button
            class="note-card__button"
            type="button"
            title="更换颜色"
            aria-label="更换颜色"
            :aria-expanded="colorMenuOpen"
            @click.stop="toggleColorMenu"
          >
            <IconPalette :size="14" />
          </button>
          <span
            v-if="colorMenuOpen"
            class="note-card__color-menu"
            role="menu"
            aria-label="便签颜色"
          >
            <button
              v-for="color in NOTE_COLOR_OPTIONS"
              :key="color.value"
              class="note-card__color"
              :class="{ 'note-card__color--active': color.value === note.color }"
              type="button"
              :style="{ background: color.value }"
              :title="color.name"
              :aria-label="`使用颜色 ${color.name}`"
              @click="selectColor(color.value)"
            ></button>
          </span>
        </span>
        <span class="note-card__menu-anchor" @pointerdown.stop>
          <button
            class="note-card__button"
            type="button"
            title="透明度"
            aria-label="透明度"
            :aria-expanded="opacityMenuOpen"
            @click.stop="toggleOpacityMenu"
          >
            <IconAdjustmentsHorizontal :size="14" />
          </button>
          <span
            v-if="opacityMenuOpen"
            class="note-card__opacity-menu"
            role="group"
            aria-label="便签透明度"
          >
            <span
              ref="sliderRef"
              class="note-opacity-slider"
              role="slider"
              tabindex="0"
              :aria-valuemin="Math.round(NOTE_MIN_OPACITY * 100)"
              :aria-valuemax="Math.round(NOTE_MAX_OPACITY * 100)"
              :aria-valuenow="Math.round(note.opacity * 100)"
              aria-valuetext="百分比"
              @pointerdown="onSliderPointerDown"
              @pointermove="onSliderPointerMove"
              @pointerup="onSliderPointerUp"
              @pointercancel="onSliderPointerUp"
              @keydown="onSliderKeydown"
            >
              <span class="note-opacity-slider__track">
                <span
                  class="note-opacity-slider__fill"
                  :style="{ width: `${Math.round(note.opacity * 100)}%` }"
                ></span>
              </span>
              <span
                class="note-opacity-slider__thumb"
                :style="{ left: `${Math.round(note.opacity * 100)}%` }"
              ></span>
            </span>
            <span class="note-card__opacity-value">{{ Math.round(note.opacity * 100) }}%</span>
          </span>
        </span>
        <button
          class="note-card__button"
          type="button"
          :title="note.pinned ? '取消置顶' : '置顶'"
          :aria-label="note.pinned ? '取消置顶' : '置顶'"
          :aria-pressed="note.pinned"
          @click.stop="togglePinned"
        >
          <IconPinFilled v-if="note.pinned" :size="14" />
          <IconPin v-else :size="14" />
        </button>
        <button
          class="note-card__button note-card__button--danger"
          type="button"
          title="删除便签"
          aria-label="删除便签"
          @click.stop="emit('delete', note.id)"
        >
          <IconTrash :size="14" />
        </button>
      </span>
    </header>

    <Transition name="note-card__body">
      <div v-if="!note.collapsed" class="note-card__body" @pointerdown="emit('front', note.id)">
        <NoteEditor
          v-if="note.mode === 'edit'"
          :model-value="note.content"
          @update:model-value="updateContent"
        />
        <NotePreview v-else :content="note.content" />
      </div>
    </Transition>

    <span
      class="note-card__resizer"
      role="separator"
      aria-label="调整便签大小"
      @pointerdown="onResizePointerDown($event, false)"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
    ></span>
    <span
      class="note-card__resizer note-card__resizer--left"
      role="separator"
      aria-label="调整便签大小"
      @pointerdown="onResizePointerDown($event, true)"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerUp"
    ></span>
  </article>
</template>
