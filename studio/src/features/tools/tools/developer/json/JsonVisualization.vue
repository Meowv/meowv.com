<script setup lang="ts">
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconFocusCentered,
  IconMinus,
  IconPlus,
} from '@tabler/icons-vue';
import { createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSONCrack, type JSONCrackRef } from 'jsoncrack-react';
import 'jsoncrack-react/style.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '@/composables/useTheme';

const props = defineProps<{
  source: string;
}>();

const GRAPH_NODE_LIMIT = 500;
const UPDATE_DELAY = 300;
const FIT_DELAY = 180;
const { resolved: resolvedTheme } = useTheme();
const rootElement = ref<HTMLDivElement | null>(null);
const canvasElement = ref<HTMLDivElement | null>(null);
const state = ref<'empty' | 'invalid' | 'ready'>('empty');
const errorMessage = ref('');
const controlMessage = ref('');
const isFullscreen = ref(false);
const graphRef = createRef<JSONCrackRef>();
let reactRoot: Root | null = null;
let currentGraphSource: string | null = null;
let updateTimer: number | undefined;
let fitTimer: number | undefined;
let resizeObserver: ResizeObserver | null = null;

function renderNodeLimitExceeded(nodeCount: number, maxNodeCount: number): ReactNode {
  return createElement(
    'div',
    {
      className: 'json-visualization__limit',
      role: 'status',
    },
    createElement('strong', null, '数据过大，暂不支持可视化'),
    createElement('span', null, `当前 ${nodeCount} 个节点，最多支持 ${maxNodeCount} 个节点。`),
  );
}

function renderGraph(source: string): void {
  if (!reactRoot) return;
  reactRoot.render(
    createElement(JSONCrack, {
      ref: graphRef,
      json: source,
      theme: resolvedTheme.value,
      layoutDirection: 'RIGHT',
      showControls: false,
      showGrid: true,
      trackpadZoom: false,
      centerOnLayout: true,
      maxRenderableNodes: GRAPH_NODE_LIMIT,
      onParseError: handleParseError,
      renderNodeLimitExceeded,
      style: { width: '100%', height: '100%' },
    }),
  );
}

function handleParseError(error: Error): void {
  currentGraphSource = null;
  errorMessage.value = error.message;
  state.value = 'invalid';
}

function updateGraph(source: string): void {
  if (!reactRoot) return;
  const trimmed = source.trim();
  if (!trimmed) {
    currentGraphSource = null;
    errorMessage.value = '';
    state.value = 'empty';
    reactRoot.render(null);
    return;
  }

  try {
    JSON.parse(trimmed);
  } catch (error) {
    currentGraphSource = null;
    errorMessage.value = error instanceof Error ? error.message : 'JSON 格式无效。';
    state.value = 'invalid';
    reactRoot.render(null);
    return;
  }

  currentGraphSource = source;
  errorMessage.value = '';
  state.value = 'ready';
  renderGraph(source);
}

function scheduleUpdate(source: string): void {
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(() => updateGraph(source), UPDATE_DELAY);
}

function fit(): void {
  window.clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => {
    if (state.value === 'ready') graphRef.current?.centerView();
  }, FIT_DELAY);
}

function centerView(): void {
  if (state.value === 'ready') graphRef.current?.centerView();
}

function zoomOut(): void {
  if (state.value === 'ready') graphRef.current?.zoomOut();
}

function zoomIn(): void {
  if (state.value === 'ready') graphRef.current?.zoomIn();
}

async function toggleFullscreen(): Promise<void> {
  const root = rootElement.value;
  if (!root || !document.fullscreenEnabled || !root.requestFullscreen) {
    controlMessage.value = '当前浏览器不支持全屏显示。';
    return;
  }

  try {
    if (document.fullscreenElement === root) await document.exitFullscreen();
    else await root.requestFullscreen();
  } catch {
    controlMessage.value = '未能切换全屏显示，请检查浏览器权限。';
  }
}

function syncFullscreen(): void {
  isFullscreen.value = document.fullscreenElement === rootElement.value;
  controlMessage.value = isFullscreen.value ? '已进入全屏显示。' : '已退出全屏显示。';
  fit();
}

defineExpose({ fit });

watch(
  () => props.source,
  (source) => scheduleUpdate(source),
);

watch(resolvedTheme, () => {
  if (currentGraphSource !== null) renderGraph(currentGraphSource);
});

onMounted(() => {
  if (!canvasElement.value) return;
  reactRoot = createRoot(canvasElement.value);
  updateGraph(props.source);
  resizeObserver = new ResizeObserver(() => fit());
  resizeObserver.observe(canvasElement.value);
  document.addEventListener('fullscreenchange', syncFullscreen);
});

onBeforeUnmount(() => {
  window.clearTimeout(updateTimer);
  window.clearTimeout(fitTimer);
  resizeObserver?.disconnect();
  document.removeEventListener('fullscreenchange', syncFullscreen);
  if (document.fullscreenElement === rootElement.value) {
    void document.exitFullscreen().catch(() => undefined);
  }
  reactRoot?.unmount();
  resizeObserver = null;
  reactRoot = null;
});
</script>

<template>
  <div ref="rootElement" class="json-visualization" aria-label="JSON 可视化">
    <div
      ref="canvasElement"
      class="json-visualization__canvas"
      :class="{ 'json-visualization__canvas--hidden': state !== 'ready' }"
    ></div>

    <div v-if="state === 'empty'" class="json-visualization__state" role="status">
      <strong>等待 JSON 内容</strong>
      <span>输入有效 JSON 后将在这里显示可视化图谱。</span>
    </div>

    <div v-else-if="state === 'invalid'" class="json-visualization__state" role="alert">
      <strong>JSON 格式无效</strong>
      <span>请修正编辑器中的 JSON 后重试。</span>
      <code v-if="errorMessage">{{ errorMessage }}</code>
    </div>

    <div
      v-if="state === 'ready'"
      class="json-visualization__toolbar"
      role="toolbar"
      aria-label="图谱视图操作"
    >
      <button type="button" aria-label="适应画布" title="适应画布" @click="centerView">
        <IconFocusCentered :size="22" aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-label="isFullscreen ? '退出全屏' : '进入全屏'"
        :title="isFullscreen ? '退出全屏' : '进入全屏'"
        @click="toggleFullscreen"
      >
        <IconArrowsMinimize v-if="isFullscreen" :size="22" aria-hidden="true" />
        <IconArrowsMaximize v-else :size="22" aria-hidden="true" />
      </button>
      <button type="button" aria-label="缩小图谱" title="缩小图谱" @click="zoomOut">
        <IconMinus :size="22" aria-hidden="true" />
      </button>
      <button type="button" aria-label="放大图谱" title="放大图谱" @click="zoomIn">
        <IconPlus :size="22" aria-hidden="true" />
      </button>
    </div>

    <p class="visually-hidden" aria-live="polite">{{ controlMessage }}</p>
  </div>
</template>

<style scoped>
.json-visualization {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
  background: var(--color-surface-soft);
}

.json-visualization__canvas {
  width: 100%;
  height: 100%;
  min-height: 520px;
}

.json-visualization__canvas--hidden {
  visibility: hidden;
}

.json-visualization__toolbar {
  position: absolute;
  z-index: 5;
  bottom: 16px;
  left: 16px;
  display: flex;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 15px;
  align-items: center;
  gap: 2px;
  background: color-mix(in srgb, var(--color-surface-solid) 96%, transparent);
  box-shadow: 0 8px 24px rgb(15 23 42 / 12%);
  backdrop-filter: blur(10px);
}

.json-visualization__toolbar button {
  display: inline-grid;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  place-items: center;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    color 140ms ease,
    background 140ms ease;
}

.json-visualization__toolbar button:hover,
.json-visualization__toolbar button:focus-visible {
  background: var(--color-surface-soft);
  color: var(--tools-accent);
}

.json-visualization__toolbar button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tools-accent) 58%, transparent);
  outline-offset: -2px;
}

.json-visualization__state {
  position: absolute;
  inset: 0;
  display: flex;
  padding: 24px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  background:
    linear-gradient(color-mix(in srgb, var(--color-border) 32%, transparent) 1px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-border) 32%, transparent) 1px,
      transparent 1px
    ),
    var(--color-surface-soft);
  background-size: 20px 20px;
  color: var(--color-text-muted);
  text-align: center;
}

.json-visualization__state strong {
  color: var(--color-text);
  font-size: 13px;
}

.json-visualization__state span {
  font-size: 11px;
}

.json-visualization__state code {
  max-width: min(560px, 100%);
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: var(--color-danger);
  font-size: 10px;
}

:global(.json-visualization__limit) {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 7px;
}

:global(.json-visualization__limit strong) {
  font-size: 13px;
}

:global(.json-visualization__limit span) {
  color: rgb(255 255 255 / 78%);
  font-size: 11px;
}

.json-visualization:fullscreen {
  width: 100vw;
  height: 100vh;
  min-height: 0;
  background: var(--color-surface-soft);
}

.json-visualization:fullscreen .json-visualization__canvas {
  min-height: 100%;
}

@container (max-width: 760px) {
  .json-visualization,
  .json-visualization__canvas {
    min-height: 440px;
  }
}
</style>
