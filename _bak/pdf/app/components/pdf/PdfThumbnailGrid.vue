<script setup lang="ts">
import { ArrowLeft, ArrowRight, GripVertical, RotateCw, TriangleAlert } from "@lucide/vue";
import { VueDraggable } from "vue-draggable-plus";
import type { PageState } from "@pdf/types";
import { openPdfDocument, renderPdfPage, type ManagedPdfDocument } from "@pdf/render/pdfjs";

const props = withDefaults(
  defineProps<{
    modelValue: PageState[];
    bytes: Uint8Array;
    selectedIds: Set<string>;
    thumbnailWidth?: number;
    sortable?: boolean;
  }>(),
  {
    thumbnailWidth: 150,
    sortable: true
  }
);

const emit = defineEmits<{
  "update:modelValue": [pages: PageState[]];
  select: [id: string, event: MouseEvent];
}>();

const items = computed({
  get: () => props.modelValue,
  set: (value: PageState[]) => emit("update:modelValue", value)
});

const documentProxy = shallowRef<ManagedPdfDocument | null>(null);
const canvasById = new Map<string, HTMLCanvasElement>();
const renderedSignatures = new Map<string, string>();
const renderQueues = new Map<string, Promise<void>>();
const visibleIds = new Set<string>();
const renderWaiters: Array<() => void> = [];
const failed = reactive(new Set<string>());
let observer: IntersectionObserver | null = null;
let loadingDocument: Promise<ManagedPdfDocument> | null = null;
let documentVersion = 0;
let activeRenderCount = 0;

async function acquireRenderSlot(): Promise<() => void> {
  if (activeRenderCount < 4) {
    activeRenderCount += 1;
  } else {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }

  return () => {
    const next = renderWaiters.shift();
    if (next) {
      next();
    } else {
      activeRenderCount = Math.max(0, activeRenderCount - 1);
    }
  };
}

async function getDocument(): Promise<ManagedPdfDocument> {
  if (documentProxy.value) {
    return documentProxy.value;
  }
  if (!loadingDocument) {
    const version = documentVersion;
    loadingDocument = openPdfDocument(props.bytes).then(async (document) => {
      if (version !== documentVersion) {
        await document.destroyDocument();
        throw new DOMException("预览已更新", "AbortError");
      }
      documentProxy.value = document;
      return document;
    });
  }
  return loadingDocument;
}

async function renderThumbnail(id: string): Promise<void> {
  const previous = renderQueues.get(id) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      const page = items.value.find((item) => item.id === id);
      const canvas = canvasById.get(id);
      if (!page || !canvas || !visibleIds.has(id)) {
        return;
      }
      const signature = `${page.sourceIndex}:${page.rotation}`;
      if (renderedSignatures.get(id) === signature) {
        return;
      }

      const releaseRenderSlot = await acquireRenderSlot();
      try {
        const latestCanvas = canvasById.get(id);
        const latestPage = items.value.find((item) => item.id === id);
        if (
          !visibleIds.has(id) ||
          latestCanvas !== canvas ||
          !latestPage ||
          `${latestPage.sourceIndex}:${latestPage.rotation}` !== signature
        ) {
          return;
        }
        const document = await getDocument();
        const renderedPage = await renderPdfPage(document, page.sourceIndex + 1, canvas, {
          maxWidth: props.thumbnailWidth,
          scale: 1.5,
          rotation: page.rotation
        });
        renderedPage.cleanup();
        const currentPage = items.value.find((item) => item.id === id);
        if (
          currentPage &&
          `${currentPage.sourceIndex}:${currentPage.rotation}` === signature &&
          canvasById.get(id) === canvas
        ) {
          renderedSignatures.set(id, signature);
          failed.delete(id);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          failed.add(id);
        }
        renderedSignatures.delete(id);
      } finally {
        releaseRenderSlot();
      }
    });

  renderQueues.set(id, queued);
  try {
    await queued;
  } finally {
    if (renderQueues.get(id) === queued) {
      renderQueues.delete(id);
    }
  }
}

function releaseThumbnail(id: string): void {
  const previous = renderQueues.get(id) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(() => {
      if (visibleIds.has(id)) {
        return;
      }
      const canvas = canvasById.get(id);
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      renderedSignatures.delete(id);
    });
  renderQueues.set(id, queued);
  void queued.finally(() => {
    if (renderQueues.get(id) === queued) {
      renderQueues.delete(id);
    }
  });
}

function setCanvas(id: string, element: Element | ComponentPublicInstance | null): void {
  const previous = canvasById.get(id);
  if (previous && previous !== element) {
    observer?.unobserve(previous);
  }
  if (element instanceof HTMLCanvasElement) {
    canvasById.set(id, element);
    observer?.observe(element);
  } else {
    canvasById.delete(id);
    visibleIds.delete(id);
    renderedSignatures.delete(id);
  }
}

function movePage(index: number, offset: -1 | 1): void {
  const target = index + offset;
  if (target < 0 || target >= items.value.length) {
    return;
  }
  const next = [...items.value];
  const [page] = next.splice(index, 1);
  if (page) {
    next.splice(target, 0, page);
    items.value = next;
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.pageId;
        if (!id) {
          continue;
        }
        if (entry.isIntersecting) {
          visibleIds.add(id);
          void renderThumbnail(id);
        } else {
          visibleIds.delete(id);
          releaseThumbnail(id);
        }
      }
    },
    { rootMargin: "240px" }
  );
  for (const canvas of canvasById.values()) {
    observer.observe(canvas);
  }
});

watch(
  () => props.bytes,
  async () => {
    documentVersion += 1;
    observer?.disconnect();
    renderedSignatures.clear();
    visibleIds.clear();
    failed.clear();
    loadingDocument = null;
    await Promise.allSettled(renderQueues.values());
    renderQueues.clear();
    if (documentProxy.value) {
      await documentProxy.value.destroyDocument();
      documentProxy.value = null;
    }
    await nextTick();
    for (const canvas of canvasById.values()) {
      observer?.observe(canvas);
    }
  }
);

watch(
  () => props.modelValue.map((page) => `${page.id}:${page.rotation}`).join("|"),
  async () => {
    const activeIds = new Set(props.modelValue.map((page) => page.id));
    for (const id of [...renderedSignatures.keys()]) {
      if (!activeIds.has(id)) {
        renderedSignatures.delete(id);
        visibleIds.delete(id);
        failed.delete(id);
      }
    }
    await nextTick();
    for (const canvas of canvasById.values()) {
      observer?.observe(canvas);
    }
    for (const id of visibleIds) {
      void renderThumbnail(id);
    }
  }
);

onBeforeUnmount(() => {
  documentVersion += 1;
  observer?.disconnect();
  observer = null;
  visibleIds.clear();
  const pendingRenders = [...renderQueues.values()];
  renderQueues.clear();
  canvasById.clear();
  renderedSignatures.clear();
  const activeDocument = documentProxy.value;
  documentProxy.value = null;
  if (activeDocument) {
    void Promise.allSettled(pendingRenders).then(() => activeDocument.destroyDocument());
  }
});
</script>

<template>
  <VueDraggable
    v-model="items"
    class="thumbnail-grid"
    :disabled="!sortable"
    handle=".thumbnail-card__drag"
    :animation="180"
    aria-label="PDF 页面缩略图"
  >
    <article
      v-for="(page, index) in items"
      :key="page.id"
      class="thumbnail-card"
      :class="{
        'is-selected': selectedIds.has(page.id),
        'is-deleted': page.deleted
      }"
    >
      <div class="thumbnail-card__toolbar">
        <button
          v-if="sortable"
          type="button"
          class="icon-button thumbnail-card__drag"
          aria-label="拖动调整页面顺序"
        >
          <GripVertical :size="15" />
        </button>
        <span>{{ index + 1 }}</span>
        <span v-if="page.rotation" class="rotation-badge">
          <RotateCw :size="13" /> {{ page.rotation }}°
        </span>
      </div>

      <button
        type="button"
        class="thumbnail-card__preview"
        :aria-pressed="selectedIds.has(page.id)"
        :aria-label="`选择原第 ${page.originalPageNumber} 页，当前第 ${index + 1} 页`"
        @click="emit('select', page.id, $event)"
      >
        <canvas
          :ref="(element) => setCanvas(page.id, element)"
          :data-page-id="page.id"
          aria-hidden="true"
        ></canvas>
        <span v-if="failed.has(page.id)" class="thumbnail-error">
          <TriangleAlert :size="20" /> 预览失败
        </span>
        <span v-if="page.deleted" class="thumbnail-deleted">将删除</span>
      </button>

      <div class="thumbnail-card__meta">
        <span>原第 {{ page.originalPageNumber }} 页</span>
        <div v-if="sortable" class="thumbnail-card__keyboard">
          <button
            type="button"
            class="icon-button"
            :disabled="index === 0"
            :aria-label="`将第 ${index + 1} 页向前移动`"
            @click="movePage(index, -1)"
          >
            <ArrowLeft :size="14" />
          </button>
          <button
            type="button"
            class="icon-button"
            :disabled="index === items.length - 1"
            :aria-label="`将第 ${index + 1} 页向后移动`"
            @click="movePage(index, 1)"
          >
            <ArrowRight :size="14" />
          </button>
        </div>
      </div>
    </article>
  </VueDraggable>
</template>
