<script setup lang="ts">
import type { CSSProperties } from "vue";
import { ChevronLeft, ChevronRight, Expand, Maximize2, Minus, Plus, RotateCw } from "@lucide/vue";
import { openPdfDocument, renderPdfPage, type ManagedPdfDocument } from "@pdf/render/pdfjs";

const props = defineProps<{
  bytes: Uint8Array;
  label?: string;
  overlayText?: string;
  overlayImageUrl?: string;
  overlayOpacity?: number;
  overlayRotation?: number;
  overlayPosition?: string;
  overlayColor?: string;
  overlayFontSize?: number;
  overlayScale?: number;
  overlayTiled?: boolean;
  overlayHorizontalGap?: number;
  overlayVerticalGap?: number;
  overlayHorizontalMargin?: number;
  overlayVerticalMargin?: number;
}>();

const root = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const documentProxy = shallowRef<ManagedPdfDocument | null>(null);
const pageNumber = ref(1);
const pageCount = ref(0);
const zoom = ref(1.2);
const previewRotation = ref(0);
const fit = ref<"page" | "width">("page");
const loading = ref(true);
const renderError = ref("");
let renderVersion = 0;
let documentVersion = 0;
let renderQueue: Promise<void> = Promise.resolve();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function overlayBaseStyle(): CSSProperties {
  const fontSize = clamp((props.overlayFontSize ?? 36) * 0.7, 12, 72);
  return {
    opacity: props.overlayOpacity ?? 0.35,
    color: props.overlayColor ?? "#d84a4a",
    fontSize: `${fontSize}px`
  };
}

const overlayItems = computed<CSSProperties[]>(() => {
  const base = overlayBaseStyle();
  if (props.overlayTiled) {
    const horizontalStep = clamp(18 + (props.overlayHorizontalGap ?? 90) / 4, 22, 58);
    const verticalStep = clamp(16 + (props.overlayVerticalGap ?? 80) / 4, 20, 54);
    const items: CSSProperties[] = [];
    for (let top = 8; top <= 92; top += verticalStep) {
      for (let left = 8; left <= 92; left += horizontalStep) {
        items.push({
          ...base,
          top: `${top}%`,
          left: `${left}%`,
          right: "auto",
          bottom: "auto",
          maxWidth: "42%",
          transform: `translate(-50%, -50%) rotate(${props.overlayRotation ?? -24}deg)`
        });
      }
    }
    return items;
  }

  const position = props.overlayPosition ?? "center";
  const isTop = position.startsWith("top");
  const isBottom = position.startsWith("bottom");
  const isLeft = position.endsWith("left");
  const isRight = position.endsWith("right");
  const horizontalEdge = `${clamp((props.overlayHorizontalMargin ?? 28) / 6, 3, 28)}%`;
  const verticalEdge = `${clamp((props.overlayVerticalMargin ?? 28) / 8, 3, 24)}%`;

  return [
    {
      ...base,
      top: isBottom ? "auto" : isTop ? verticalEdge : "50%",
      bottom: isBottom ? verticalEdge : "auto",
      left: isRight ? "auto" : isLeft ? horizontalEdge : "50%",
      right: isRight ? horizontalEdge : "auto",
      transform: `translate(${isLeft || isRight ? "0" : "-50%"}, ${
        isTop || isBottom ? "0" : "-50%"
      }) rotate(${props.overlayRotation ?? -24}deg)`
    }
  ];
});

const overlayImageStyle = computed<CSSProperties>(() => ({
  width: `${clamp(120 * (props.overlayScale ?? 1), 36, 240)}px`
}));

async function loadDocument(): Promise<void> {
  const version = ++documentVersion;
  loading.value = true;
  renderError.value = "";
  const previousDocument = documentProxy.value;
  documentProxy.value = null;
  if (previousDocument) {
    await renderQueue.catch(() => undefined);
    await previousDocument.destroyDocument();
  }
  try {
    const loadedDocument = await openPdfDocument(props.bytes);
    if (version !== documentVersion) {
      await loadedDocument.destroyDocument();
      return;
    }
    documentProxy.value = loadedDocument;
    pageCount.value = loadedDocument.numPages;
    pageNumber.value = Math.min(pageNumber.value, pageCount.value);
    await nextTick();
    await queueRender();
  } catch (error) {
    if (version === documentVersion) {
      renderError.value = error instanceof Error ? error.message : "PDF 预览加载失败";
    }
  } finally {
    if (version === documentVersion) {
      loading.value = false;
    }
  }
}

function queueRender(): Promise<void> {
  const version = ++renderVersion;
  const queued = renderQueue.catch(() => undefined).then(() => render(version));
  renderQueue = queued;
  return queued;
}

async function render(version: number): Promise<void> {
  if (version !== renderVersion) {
    return;
  }
  if (!documentProxy.value || !canvas.value || !viewport.value) {
    return;
  }

  const activeDocument = documentProxy.value;
  try {
    const maxWidth =
      fit.value === "width"
        ? Math.max(280, viewport.value.clientWidth - 32)
        : Math.max(280, Math.min(760, viewport.value.clientWidth - 32));
    await renderPdfPage(activeDocument, pageNumber.value, canvas.value, {
      maxWidth,
      scale: fit.value === "width" ? 4 : zoom.value,
      rotation: previewRotation.value
    });
    if (version === renderVersion) {
      renderError.value = "";
    }
  } catch (error) {
    if (version === renderVersion) {
      renderError.value = error instanceof Error ? error.message : "当前页面预览失败";
    }
  }
}

function changePage(delta: number): void {
  pageNumber.value = Math.min(pageCount.value, Math.max(1, pageNumber.value + delta));
}

function changeZoom(delta: number): void {
  fit.value = "page";
  zoom.value = Math.min(3, Math.max(0.5, Number((zoom.value + delta).toFixed(1))));
}

function rotatePreview(): void {
  previewRotation.value = (previewRotation.value + 90) % 360;
}

function onWheel(event: WheelEvent): void {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  event.preventDefault();
  changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
}

async function enterFullscreen(): Promise<void> {
  if (root.value?.requestFullscreen) {
    await root.value.requestFullscreen();
  }
}

watch(() => props.bytes, loadDocument);
watch([pageNumber, zoom, previewRotation, fit], () => {
  void queueRender();
});

onMounted(() => {
  void loadDocument();
});

onBeforeUnmount(() => {
  documentVersion += 1;
  renderVersion += 1;
  const activeDocument = documentProxy.value;
  documentProxy.value = null;
  if (activeDocument) {
    void renderQueue.catch(() => undefined).then(() => activeDocument.destroyDocument());
  }
  if (canvas.value) {
    canvas.value.width = 1;
    canvas.value.height = 1;
  }
});
</script>

<template>
  <section ref="root" class="pdf-viewer" :aria-label="label || 'PDF 页面预览'">
    <div class="pdf-viewer__toolbar">
      <div class="toolbar-group">
        <button
          type="button"
          class="icon-button"
          :disabled="pageNumber <= 1"
          aria-label="上一页"
          @click="changePage(-1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <span class="page-indicator">{{ pageNumber }} / {{ pageCount || "—" }}</span>
        <button
          type="button"
          class="icon-button"
          :disabled="pageNumber >= pageCount"
          aria-label="下一页"
          @click="changePage(1)"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <div class="toolbar-group">
        <button type="button" class="icon-button" aria-label="缩小" @click="changeZoom(-0.1)">
          <Minus :size="17" />
        </button>
        <span class="zoom-indicator">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="icon-button" aria-label="放大" @click="changeZoom(0.1)">
          <Plus :size="17" />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="适应宽度"
          @click="fit = fit === 'width' ? 'page' : 'width'"
        >
          <Expand :size="17" />
        </button>
        <button type="button" class="icon-button" aria-label="旋转预览" @click="rotatePreview">
          <RotateCw :size="17" />
        </button>
        <button type="button" class="icon-button" aria-label="全屏预览" @click="enterFullscreen">
          <Maximize2 :size="17" />
        </button>
      </div>
    </div>

    <div ref="viewport" class="pdf-viewer__viewport" @wheel="onWheel">
      <div v-if="loading" class="viewer-placeholder" aria-live="polite">正在生成页面预览…</div>
      <div v-else-if="renderError" class="viewer-placeholder viewer-placeholder--error">
        {{ renderError }}
      </div>
      <div v-show="!loading && !renderError" class="pdf-viewer__page">
        <canvas ref="canvas" :aria-label="`第 ${pageNumber} 页`"></canvas>
        <span
          v-for="(itemStyle, index) in overlayText || overlayImageUrl ? overlayItems : []"
          :key="index"
          class="pdf-viewer__overlay"
          :style="itemStyle"
          aria-hidden="true"
        >
          <img v-if="overlayImageUrl" :src="overlayImageUrl" :style="overlayImageStyle" alt="" />
          <template v-else>{{ overlayText }}</template>
        </span>
      </div>
    </div>
  </section>
</template>
