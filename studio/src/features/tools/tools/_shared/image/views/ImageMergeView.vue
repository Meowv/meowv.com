<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { downloadBlob } from '@/core/browser/download';
import { useFileHandoff } from '@/core/browser/file-handoff';
import ImageDropzone from '../components/upload/ImageDropzone.vue';
import ImageToolHeader from '../components/layout/ImageToolHeader.vue';
import ImageMergeEditor from '../components/merge/ImageMergeEditor.vue';
import { useImagePaste } from '../composables/useImagePaste';
import { FileImage, Plus, Download, Trash2, Move, Settings2 } from '../icons';
import { INPUT_IMAGE_ACCEPT, isSupportedImageFilename } from '../core/image';
import { detectEncodingCapabilities } from '../core/image/process';
import {
  arrangeMergeDocument,
  assertMergeSize,
  copyMergeDocument,
  createMergeAsset,
  exportMergeDocument,
  fitMergeDocument,
  MAX_MERGE_IMAGES,
  MAX_MERGE_PIXELS,
  MAX_MERGE_SIDE,
  type MergeAsset,
  type MergeDocument,
  type MergeLayer,
  type MergeMime,
} from '../core/image/merge';

defineProps<{ embedded?: boolean }>();

const initialDocument = (): MergeDocument => ({
  width: 1200,
  height: 800,
  background: 'transparent',
  layers: [],
});
const value = ref<MergeDocument>(initialDocument());
const assets = shallowRef(new Map<string, MergeAsset>());
const selectedId = ref('');
const past = ref<MergeDocument[]>([]);
const future = ref<MergeDocument[]>([]);
const editor = ref<InstanceType<typeof ImageMergeEditor> | null>(null);
const workbench = ref<HTMLDivElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const reading = ref(false);
const exporting = ref(false);
const gesturing = ref(false);
const panMode = ref(false);
const panelOpen = ref(false);
const narrow = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const panelToggle = ref<HTMLButtonElement | null>(null);
let panelMedia: MediaQueryList | undefined;

function updateNarrow() {
  narrow.value = panelMedia?.matches ?? false;
  if (!narrow.value) panelOpen.value = false;
}

function panelKeyboard(event: KeyboardEvent) {
  if (!narrow.value || !panelOpen.value) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    panelOpen.value = false;
    return;
  }
  if (event.key === 'Tab') {
    const controls = Array.from(
      panelRef.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ) ?? [],
    ).filter((item) => item.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  keyboard(event);
}

watch(panelOpen, async (open) => {
  await nextTick();
  if (open) {
    if (panelRef.value) panelRef.value.scrollTop = 0;
    panelRef.value
      ?.querySelector<HTMLButtonElement>('.merge-panel-close')
      ?.focus({ preventScroll: true });
  } else if (narrow.value) panelToggle.value?.focus({ preventScroll: true });
});
const lockRatio = ref(true);
const gap = ref(0);
const backgroundColor = ref('#ffffff');
const outputMime = ref<MergeMime>('image/png');
const quality = ref(90);
const webpSupported = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');
const busy = computed(() => reading.value || exporting.value);
const controlsDisabled = computed(() => busy.value || gesturing.value);
const selected = computed(() => value.value.layers.find((layer) => layer.id === selectedId.value));
const selectedIndex = computed(() =>
  value.value.layers.findIndex((layer) => layer.id === selectedId.value),
);
const reversedLayers = computed(() => [...value.value.layers].reverse());
const hasImages = computed(() => value.value.layers.length > 0);
watch(hasImages, (present) => {
  if (!present) panelOpen.value = false;
});
const clippedCount = computed(
  () =>
    value.value.layers.filter(
      (layer) =>
        layer.x < 0 ||
        layer.y < 0 ||
        layer.x + layer.width > value.value.width + 0.01 ||
        layer.y + layer.height > value.value.height + 0.01,
    ).length,
);
let gestureBefore: MergeDocument | null = null;
let disposed = false;

function report(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : '操作失败，请重试。';
}

function collectAssets() {
  const used = new Set(
    [value.value, ...past.value, ...future.value].flatMap((item) =>
      item.layers.map((layer) => layer.id),
    ),
  );
  const next = new Map(assets.value);
  for (const [id, asset] of next) {
    if (!used.has(id)) {
      asset.dispose();
      next.delete(id);
    }
  }
  assets.value = next;
}

function remember(before: MergeDocument) {
  if (JSON.stringify(before) === JSON.stringify(value.value)) return;
  past.value = [...past.value.slice(-39), before];
  future.value = [];
  statusMessage.value = '';
  collectAssets();
}

function change(action: (document: MergeDocument) => MergeDocument) {
  if (controlsDisabled.value) return;
  const before = copyMergeDocument(value.value);
  try {
    const next = action(copyMergeDocument(value.value));
    assertMergeSize(next.width, next.height);
    value.value = next;
    errorMessage.value = '';
    remember(before);
  } catch (error) {
    report(error);
  }
}

function restore(direction: 'undo' | 'redo') {
  if (controlsDisabled.value) return;
  const from = direction === 'undo' ? past : future;
  const to = direction === 'undo' ? future : past;
  const document = from.value.at(-1);
  if (!document) return;
  to.value = [...to.value.slice(-39), copyMergeDocument(value.value)];
  from.value = from.value.slice(0, -1);
  value.value = copyMergeDocument(document);
  if (!hasImages.value) void nextTick(() => workbench.value?.focus({ preventScroll: true }));
  if (!selected.value) selectedId.value = value.value.layers.at(-1)?.id ?? '';
  errorMessage.value = '';
  statusMessage.value = '';
}

function beginGesture() {
  gestureBefore = copyMergeDocument(value.value);
  gesturing.value = true;
  errorMessage.value = '';
}

function moveLayer(layer: MergeLayer) {
  value.value = {
    ...value.value,
    layers: value.value.layers.map((item) => (item.id === layer.id ? layer : item)),
  };
}

function endGesture(cancel = false) {
  if (gestureBefore) {
    if (cancel) value.value = gestureBefore;
    else remember(gestureBefore);
  }
  gestureBefore = null;
  gesturing.value = false;
}

async function addFiles(files: File[]) {
  if (controlsDisabled.value || files.length === 0) return;
  reading.value = true;
  errorMessage.value = '';
  statusMessage.value = '正在读取图片…';
  const before = copyMergeDocument(value.value);
  const imported: MergeAsset[] = [];
  const errors: string[] = [];
  const currentPixels = [...assets.value.values()].reduce(
    (sum, item) => sum + item.width * item.height,
    0,
  );
  let remainingPixels = MAX_MERGE_PIXELS - currentPixels;
  const available = MAX_MERGE_IMAGES - value.value.layers.length;
  if (files.length > available)
    errors.push(`最多放入 ${MAX_MERGE_IMAGES} 张图片，超出部分未导入。`);
  try {
    for (const file of files.slice(0, available)) {
      if (disposed) break;
      if (!isSupportedImageFilename(file.name) && !file.type.startsWith('image/')) {
        errors.push('已跳过不支持的文件。');
        continue;
      }
      try {
        const asset = await createMergeAsset(file, remainingPixels);
        imported.push(asset);
        remainingPixels -= asset.width * asset.height;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : '有图片读取失败。');
      }
    }
    if (disposed) {
      imported.forEach((item) => item.dispose());
      return;
    }
    if (imported.length > 0) {
      const center = editor.value?.viewportCenter() ?? {
        x: value.value.width / 2,
        y: value.value.height / 2,
      };
      const layers = imported.map((asset, index) => ({
        id: asset.id,
        x: center.x - asset.width / 2 + index * 20,
        y: center.y - asset.height / 2 + index * 20,
        width: asset.width,
        height: asset.height,
      }));
      let next: MergeDocument = { ...value.value, layers: [...value.value.layers, ...layers] };
      if (!hasImages.value) {
        // 初次排版按需统一缩小，避免多张长图横排后超过画布上限。
        const width = layers.reduce((sum, item) => sum + item.width, 0);
        const height = Math.max(...layers.map((item) => item.height));
        const availableScale = Math.min(
          1,
          MAX_MERGE_SIDE / width,
          MAX_MERGE_SIDE / height,
          Math.sqrt(MAX_MERGE_PIXELS / (width * height)),
        );
        const scale = availableScale < 1 ? availableScale * 0.9999 : 1;
        next = arrangeMergeDocument(
          {
            ...next,
            layers: layers.map((layer) => ({
              ...layer,
              width: layer.width * scale,
              height: layer.height * scale,
            })),
          },
          'horizontal',
          0,
        );
      }
      assets.value = new Map([
        ...assets.value,
        ...imported.map((item) => [item.id, item] as const),
      ]);
      value.value = next;
      selectedId.value = imported.at(-1)!.id;
      remember(before);
      await nextTick();
      if (before.layers.length === 0) editor.value?.fit();
    }
    statusMessage.value = imported.length ? `已添加 ${imported.length} 张图片。` : '';
    errorMessage.value = [...new Set(errors)].join(' ');
  } catch (error) {
    for (const asset of imported) {
      if (!assets.value.has(asset.id)) asset.dispose();
    }
    report(error);
    statusMessage.value = '';
  } finally {
    reading.value = false;
  }
}

function inputFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  void addFiles(Array.from(input.files ?? []));
  input.value = '';
}

function removeSelected() {
  const index = selectedIndex.value;
  if (index < 0 || controlsDisabled.value) return;
  change((document) => ({
    ...document,
    layers: document.layers.filter((layer) => layer.id !== selectedId.value),
  }));
  selectedId.value = value.value.layers[Math.min(index, value.value.layers.length - 1)]?.id ?? '';
  if (!hasImages.value) void nextTick(() => workbench.value?.focus({ preventScroll: true }));
}

function reorder(target: 'top' | 'up' | 'down' | 'bottom') {
  const index = selectedIndex.value;
  if (index < 0) return;
  change((document) => {
    const destination =
      target === 'top'
        ? document.layers.length - 1
        : target === 'bottom'
          ? 0
          : index + (target === 'up' ? 1 : -1);
    const [layer] = document.layers.splice(index, 1);
    if (layer)
      document.layers.splice(Math.max(0, Math.min(document.layers.length, destination)), 0, layer);
    return document;
  });
}

function setLayerNumber(field: 'x' | 'y' | 'width' | 'height', event: Event) {
  const input = event.target as HTMLInputElement;
  const number = Number(input.value);
  const layer = selected.value;
  if (!layer) return;
  if (input.value.trim() && Number.isFinite(number)) {
    change((document) => {
      const next = { ...layer, [field]: number };
      if (lockRatio.value && field === 'width') next.height = (number * layer.height) / layer.width;
      if (lockRatio.value && field === 'height') next.width = (number * layer.width) / layer.height;
      assertMergeSize(next.width, next.height);
      if (Math.abs(next.x) > 65536 || Math.abs(next.y) > 65536)
        throw new Error('位置需在 -65536 到 65536 px 之间。');
      document.layers = document.layers.map((item) => (item.id === next.id ? next : item));
      return document;
    });
  }
  input.value = String(Math.round(selected.value?.[field] ?? 0));
}

function setCanvasSize(field: 'width' | 'height', event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.value.trim()) {
    change((document) => ({ ...document, [field]: Math.round(Number(input.value)) }));
  }
  input.value = String(value.value[field]);
}

function setBackground(event: Event) {
  const input = event.target as HTMLSelectElement;
  change((document) => ({
    ...document,
    background: input.value === 'transparent' ? 'transparent' : backgroundColor.value,
  }));
}

function setBackgroundColor(event: Event) {
  backgroundColor.value = (event.target as HTMLInputElement).value;
  change((document) => ({ ...document, background: backgroundColor.value }));
}

function arrange(direction: 'horizontal' | 'vertical') {
  const spacing = Number.isFinite(gap.value)
    ? Math.max(0, Math.min(2000, Math.round(gap.value)))
    : 0;
  gap.value = spacing;
  change((document) => arrangeMergeDocument(document, direction, spacing));
}

async function exportImage() {
  if (controlsDisabled.value || !hasImages.value) return;
  exporting.value = true;
  errorMessage.value = '';
  statusMessage.value = '正在生成合并图片…';
  try {
    const mime = outputMime.value;
    const blob = await exportMergeDocument(
      copyMergeDocument(value.value),
      assets.value,
      mime,
      quality.value,
    );
    if (disposed) return;
    const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    downloadBlob(blob, `图片合并-${value.value.width}x${value.value.height}.${extension}`);
    statusMessage.value = '合并图片已生成，已发起下载。';
  } catch (error) {
    if (!disposed) {
      report(error);
      statusMessage.value = '';
    }
  } finally {
    exporting.value = false;
  }
}

function keyboard(event: KeyboardEvent) {
  if (
    controlsDisabled.value ||
    !(event.target instanceof Element) ||
    event.target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      restore(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    }
    return;
  }
  if (!selected.value) return;
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    removeSelected();
  } else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    change((document) => ({
      ...document,
      layers: document.layers.map((layer) =>
        layer.id === selectedId.value
          ? {
              ...layer,
              x: layer.x + (key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0),
              y: layer.y + (key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0),
            }
          : layer,
      ),
    }));
  }
}

useImagePaste(addFiles, { multiple: true, disabled: () => controlsDisabled.value });
onMounted(() => {
  panelMedia = window.matchMedia('(max-width: 1100px)');
  updateNarrow();
  panelMedia.addEventListener('change', updateNarrow);
  void detectEncodingCapabilities()
    .then((result) => {
      if (!disposed) webpSupported.value = result.webp;
    })
    .catch(() => undefined);
  const file = useFileHandoff().take('image');
  if (file) void addFiles([file]);
});
onBeforeUnmount(() => {
  disposed = true;
  panelMedia?.removeEventListener('change', updateNarrow);
  for (const asset of assets.value.values()) asset.dispose();
  assets.value.clear();
});
</script>

<template>
  <div ref="workbench" class="image-merge" tabindex="-1" @keydown="keyboard">
    <ImageToolHeader
      v-if="!embedded"
      title="图片合并"
      description="自由拖动、缩放和排列多张图片，合并导出为一张图片。"
      :icon="FileImage"
    />
    <div class="tool-workbench merge-content">
      <div v-if="hasImages" class="merge-toolbar">
        <div class="merge-actions">
          <button type="button" :disabled="controlsDisabled" @click="fileInput?.click()">
            <Plus :size="16" />添加图片
          </button>
          <button
            type="button"
            :disabled="controlsDisabled || !past.length"
            title="Ctrl/Cmd + Z"
            @click="restore('undo')"
          >
            撤销
          </button>
          <button
            type="button"
            :disabled="controlsDisabled || !future.length"
            title="Ctrl/Cmd + Shift + Z"
            @click="restore('redo')"
          >
            重做
          </button>
          <button
            type="button"
            :disabled="controlsDisabled || !hasImages"
            :aria-pressed="panMode"
            @click="panMode = !panMode"
          >
            <Move :size="16" />{{ panMode ? '正在平移画布' : '平移画布' }}
          </button>
        </div>
        <div class="merge-actions">
          <button
            ref="panelToggle"
            type="button"
            class="merge-panel-toggle"
            :disabled="!hasImages"
            :aria-expanded="panelOpen"
            aria-controls="merge-properties"
            @click="panelOpen = !panelOpen"
          >
            <Settings2 :size="16" />设置与图层
          </button>
          <button
            type="button"
            class="merge-primary"
            :disabled="controlsDisabled || !hasImages"
            @click="exportImage"
          >
            <Download :size="16" />{{ exporting ? '正在导出…' : '导出图片' }}
          </button>
        </div>
      </div>

      <input
        v-if="hasImages"
        ref="fileInput"
        type="file"
        class="sr-only"
        multiple
        :accept="INPUT_IMAGE_ACCEPT"
        tabindex="-1"
        @change="inputFiles"
      />
      <p v-if="errorMessage" class="merge-message merge-message--error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="statusMessage" class="merge-message" role="status">{{ statusMessage }}</p>

      <ImageDropzone
        v-if="!hasImages"
        :disabled="busy"
        description="支持 AVIF、BMP、GIF、HEIC、JPEG、PNG、PSD、SVG、TIFF、WebP，最多 40 张"
        @files="addFiles"
      />

      <div
        v-else
        class="merge-workspace"
        @dragover.prevent
        @drop.prevent="addFiles(Array.from($event.dataTransfer?.files ?? []))"
      >
        <div class="merge-canvas-column">
          <ImageMergeEditor
            ref="editor"
            :value="value"
            :assets="assets"
            :selected-id="selectedId"
            :disabled="busy"
            :pan-mode="panMode"
            @select="selectedId = $event"
            @start="beginGesture"
            @change="moveLayer"
            @end="endGesture()"
            @cancel="endGesture(true)"
          />
          <p v-if="clippedCount" class="merge-message">
            {{ clippedCount }} 张图片超出画布，超出部分不会导出。可点击「适应全部图片」扩展画布。
          </p>
        </div>

        <Teleport to="body" :disabled="!narrow">
          <div class="image-feature image-merge merge-panel-host" @keydown="panelKeyboard">
            <button
              v-if="panelOpen"
              type="button"
              class="merge-panel-backdrop"
              tabindex="-1"
              aria-label="关闭设置与图层"
              @click="panelOpen = false"
            />
            <aside
              id="merge-properties"
              ref="panelRef"
              :role="narrow ? 'dialog' : undefined"
              :aria-modal="narrow && panelOpen ? true : undefined"
              class="merge-panel"
              :class="{ 'merge-panel--open': panelOpen }"
              aria-label="图片合并设置与图层"
            >
              <div class="merge-panel-heading">
                <strong>设置与图层</strong
                ><button type="button" class="merge-panel-close" @click="panelOpen = false">
                  完成
                </button>
              </div>
              <fieldset :disabled="controlsDisabled">
                <legend>画布</legend>
                <div class="merge-fields">
                  <label
                    >宽度 (px)<input
                      type="number"
                      min="1"
                      :max="MAX_MERGE_SIDE"
                      :value="value.width"
                      @change="setCanvasSize('width', $event)"
                  /></label>
                  <label
                    >高度 (px)<input
                      type="number"
                      min="1"
                      :max="MAX_MERGE_SIDE"
                      :value="value.height"
                      @change="setCanvasSize('height', $event)"
                  /></label>
                </div>
                <div class="merge-fields">
                  <label
                    >背景<select
                      :value="value.background === 'transparent' ? 'transparent' : 'color'"
                      @change="setBackground"
                    >
                      <option value="transparent">透明背景</option>
                      <option value="color">纯色背景</option>
                    </select></label
                  >
                  <label v-if="value.background !== 'transparent'"
                    >背景颜色<input
                      type="color"
                      :value="value.background"
                      @change="setBackgroundColor"
                  /></label>
                </div>
                <button type="button" class="merge-wide" @click="change(fitMergeDocument)">
                  适应全部图片
                </button>
                <label
                  >排列间距 (px)<input v-model.number="gap" type="number" min="0" max="2000"
                /></label>
                <div class="merge-fields">
                  <button type="button" @click="arrange('horizontal')">横向排列</button
                  ><button type="button" @click="arrange('vertical')">纵向排列</button>
                </div>
              </fieldset>

              <fieldset :disabled="controlsDisabled || !selected">
                <legend>选中图片</legend>
                <template v-if="selected">
                  <p class="merge-filename" :title="assets.get(selected.id)?.name">
                    {{ assets.get(selected.id)?.name }}
                  </p>
                  <div class="merge-fields">
                    <label
                      v-for="field in ['x', 'y', 'width', 'height'] as const"
                      :key="`${selected.id}-${field}`"
                      >{{
                        { x: 'X (px)', y: 'Y (px)', width: '宽度 (px)', height: '高度 (px)' }[
                          field
                        ]
                      }}<input
                        type="number"
                        :min="field === 'width' || field === 'height' ? 1 : -65536"
                        :max="field === 'width' || field === 'height' ? MAX_MERGE_SIDE : 65536"
                        :value="Math.round(selected[field])"
                        @change="setLayerNumber(field, $event)"
                    /></label>
                  </div>
                  <label class="merge-checkbox"
                    ><input v-model="lockRatio" type="checkbox" />锁定宽高比例</label
                  >
                  <div class="merge-fields">
                    <button
                      type="button"
                      :disabled="selectedIndex === value.layers.length - 1"
                      @click="reorder('up')"
                    >
                      上移一层</button
                    ><button type="button" :disabled="selectedIndex === 0" @click="reorder('down')">
                      下移一层</button
                    ><button
                      type="button"
                      :disabled="selectedIndex === value.layers.length - 1"
                      @click="reorder('top')"
                    >
                      置顶</button
                    ><button
                      type="button"
                      :disabled="selectedIndex === 0"
                      @click="reorder('bottom')"
                    >
                      置底
                    </button>
                  </div>
                  <button type="button" class="merge-wide" @click="removeSelected">
                    <Trash2 :size="15" />删除图片
                  </button>
                </template>
                <p v-else class="merge-hint">点击画布图片或下方图层进行选择。</p>
              </fieldset>

              <fieldset :disabled="controlsDisabled">
                <legend>图层 · {{ value.layers.length }} 张</legend>
                <p class="merge-hint">列表越靠上，图片越靠前。</p>
                <div class="merge-layers">
                  <button
                    v-for="layer in reversedLayers"
                    :key="layer.id"
                    type="button"
                    class="merge-layer"
                    :aria-pressed="selectedId === layer.id"
                    :title="assets.get(layer.id)?.name"
                    @click="selectedId = layer.id"
                  >
                    <img :src="assets.get(layer.id)?.previewUrl" alt="" draggable="false" /><span>{{
                      assets.get(layer.id)?.name
                    }}</span>
                  </button>
                </div>
              </fieldset>

              <fieldset :disabled="controlsDisabled">
                <legend>导出设置</legend>
                <label
                  >格式<select v-model="outputMime">
                    <option value="image/png">PNG · 保留透明</option>
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/webp" :disabled="!webpSupported">
                      WebP{{ webpSupported ? '' : '（浏览器不支持）' }}
                    </option>
                  </select></label
                >
                <label v-if="outputMime !== 'image/png'"
                  >质量 · {{ quality }}%<input
                    v-model.number="quality"
                    type="range"
                    min="1"
                    max="100"
                /></label>
                <p
                  v-if="outputMime === 'image/jpeg' && value.background === 'transparent'"
                  class="merge-hint"
                >
                  JPEG 不支持透明，透明区域将填充白色。
                </p>
                <p class="merge-hint">
                  输出 {{ value.width }} × {{ value.height }} px，与查看比例无关。
                </p>
                <button type="button" class="merge-wide merge-primary" @click="exportImage">
                  <Download :size="16" />导出图片
                </button>
              </fieldset>
            </aside>
          </div>
        </Teleport>
      </div>
    </div>
  </div>
</template>

<style scoped>
.merge-content {
  color: var(--text);
}
.merge-toolbar,
.merge-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.merge-toolbar {
  justify-content: space-between;
  margin-bottom: 16px;
}
.image-merge button:where(:not([data-testid='image-dropzone'])) {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.image-merge
  button:where(:not([data-testid='image-dropzone'], .merge-panel-backdrop)):hover:not(:disabled) {
  background: var(--primary-soft-hover);
  border-color: var(--primary-border);
}
.image-merge button[aria-pressed='true'] {
  color: var(--primary);
  background: var(--primary-soft);
  border-color: var(--primary);
}
.image-merge button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.image-merge button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.image-merge .merge-primary {
  background: var(--primary-solid);
  border-color: var(--primary-solid);
  color: #fff;
}
.image-merge .merge-primary:hover:not(:disabled) {
  background: var(--primary-solid-hover);
  color: #fff;
}
.merge-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
  align-items: start;
  gap: 16px;
}
.merge-canvas-column {
  min-width: 0;
}
.merge-panel-host {
  display: contents;
}
.merge-panel {
  min-width: 0;
  max-height: calc(62vh + 54px);
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
}
.merge-panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 14px;
}
.image-merge .merge-panel-toggle,
.image-merge .merge-panel-close,
.image-merge .merge-panel-backdrop {
  display: none;
}
.merge-panel fieldset {
  min-width: 0;
  margin: 0 0 20px;
  padding: 0 0 20px;
  border: 0;
  border-bottom: 1px solid var(--border);
}
.merge-panel fieldset:last-child {
  margin: 0;
  padding: 0;
  border: 0;
}
.merge-panel legend {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 650;
}
.merge-panel label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-muted);
}
.merge-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.merge-fields label {
  margin: 0;
}
.merge-panel input:not([type='checkbox']),
.merge-panel select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
}
.merge-panel input[type='color'] {
  padding: 3px;
}
.merge-panel input[type='range'] {
  padding: 0;
  accent-color: var(--primary);
}
.merge-panel .merge-checkbox {
  flex-direction: row;
  align-items: center;
  gap: 7px;
}
.merge-checkbox input {
  accent-color: var(--primary);
}
.merge-wide {
  width: 100%;
  margin-bottom: 10px;
}
.merge-hint {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.8;
}
.merge-panel .merge-hint {
  margin: 0 0 10px;
}
.merge-filename {
  margin: 0 0 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.merge-message {
  margin: 10px 0;
  padding: 10px 12px;
  border: 1px solid var(--primary-border);
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 13px;
  line-height: 1.6;
}
.merge-message--error {
  border-color: #f8717166;
  background: #ef444410;
  color: var(--text);
}
.merge-layers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 230px;
  overflow: auto;
}
.image-merge .merge-layer {
  width: 100%;
  justify-content: flex-start;
  padding: 6px;
}
.merge-layer img {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  object-fit: contain;
  background: var(--surface-subtle);
  border-radius: 4px;
}
.merge-layer span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
@media (max-width: 1100px) {
  .merge-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .image-merge .merge-panel-toggle,
  .image-merge .merge-panel-close {
    display: inline-flex;
  }
  .merge-panel {
    display: none;
  }
  .merge-panel--open {
    display: block;
    position: fixed;
    z-index: 1001;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(320px, calc(100vw - 32px));
    box-sizing: border-box;
    max-height: none;
    background: var(--surface);
    overscroll-behavior: contain;
  }
  .image-merge .merge-panel-backdrop {
    display: block;
    position: fixed;
    z-index: 1000;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: #0006;
  }
}
@media (max-width: 600px) {
  .merge-toolbar {
    align-items: stretch;
  }
  .merge-toolbar > .merge-actions {
    flex: 1 1 100%;
  }
  .merge-toolbar > .merge-actions:last-child {
    justify-content: space-between;
  }
}
</style>
