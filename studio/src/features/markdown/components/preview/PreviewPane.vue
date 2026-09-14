<script setup lang="ts">
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileCode2,
  FileText,
  FileType2,
  Folder,
  Image,
  Link2,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
} from '@/features/markdown/icons';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { preloadPdfExporter, type ExportExtension } from '@/features/markdown/services/export';
import { sanitizeMermaidSvg } from '@/features/markdown/services/mermaid-security';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';
import { enqueueMermaidTask } from '@/core/mermaid/scheduler';

const store = useWorkspaceStore();
const previewRoot = ref<HTMLElement | null>(null);
const previewScroll = ref<HTMLElement | null>(null);
const exportMenu = ref<HTMLElement | null>(null);
const exportMenuOpen = ref(false);
const exporting = ref<ExportExtension | null>(null);

let mermaidRenderSequence = 0;
let syncingScroll = false;
let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | undefined;

const title = computed(() => store.parsedDocument.metadata.title.trim());
const previewStyle = computed(() => ({
  fontSize: `${Math.min(18, Math.max(13, store.preferences.editorFontSize + 1))}px`,
}));

const bodyHtml = computed(() => {
  const html = store.previewHtml;
  if (!html || !title.value || typeof DOMParser === 'undefined') {
    return html;
  }

  const parsed = new DOMParser().parseFromString(
    `<main data-preview-body>${html}</main>`,
    'text/html',
  );
  const body = parsed.querySelector<HTMLElement>('[data-preview-body]');
  const firstHeading = body?.firstElementChild?.tagName === 'H1' ? body.firstElementChild : null;
  if (
    firstHeading &&
    normalizeHeading(firstHeading.textContent) === normalizeHeading(title.value)
  ) {
    firstHeading.remove();
  }

  return body?.innerHTML ?? html;
});

function normalizeHeading(value: string | null): string {
  return (value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function slugifyHeading(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/gu, '-')
    .replace(/^-|-$/gu, '');
}

function decodeFragment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function scrollToPreviewAnchor(anchor: string): Promise<void> {
  const decoded = decodeFragment(anchor.replace(/^#/u, '')).trim();
  if (!decoded) {
    return;
  }

  await nextTick();
  const root = previewRoot.value;
  if (!root) {
    return;
  }

  const slug = slugifyHeading(decoded);
  const target = [...root.querySelectorAll<HTMLElement>('[id]')].find(
    (element) => element.id === decoded || element.id === slug,
  );
  target?.scrollIntoView({ block: 'start' });
}

async function handlePreviewClick(event: MouseEvent): Promise<void> {
  const origin = event.target;
  if (!(origin instanceof Element)) {
    return;
  }

  const link = origin.closest<HTMLAnchorElement>('a');
  if (!link || !previewRoot.value?.contains(link)) {
    return;
  }

  const wikiTarget = link.dataset.wikiLink?.trim();
  if (wikiTarget) {
    event.preventDefault();
    await store.openWikiLink(wikiTarget);
    if (link.dataset.wikiAnchor) {
      await scrollToPreviewAnchor(link.dataset.wikiAnchor);
    }
    return;
  }
}

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise;
}

async function renderMermaidBlocks(): Promise<void> {
  const sequence = ++mermaidRenderSequence;
  await nextTick();

  const root = previewRoot.value;
  if (!root) {
    return;
  }

  const blocks = [...root.querySelectorAll<HTMLElement>('.mermaid[data-mermaid-source]')];
  if (!blocks.length) {
    return;
  }

  try {
    await enqueueMermaidTask(async () => {
      const mermaid = await loadMermaid();
      if (sequence !== mermaidRenderSequence) return;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: store.resolvedTheme === 'dark' ? 'dark' : 'default',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      });

      for (const [index, block] of blocks.entries()) {
        if (sequence !== mermaidRenderSequence || !block.isConnected) {
          return;
        }

        const encodedSource = block.dataset.mermaidSource;
        if (!encodedSource) {
          continue;
        }

        try {
          const source = decodeURIComponent(encodedSource);
          const result = await mermaid.render(`markdown-preview-${sequence}-${index}`, source);
          if (sequence !== mermaidRenderSequence || !block.isConnected) {
            return;
          }

          block.className = 'mermaid-block';
          block.innerHTML = sanitizeMermaidSvg(result.svg);
          result.bindFunctions?.(block);
        } catch {
          block.className = 'mermaid-block text-sm text-[var(--color-danger)]';
          block.textContent = 'Mermaid 图表渲染失败，请检查图表语法。';
        }
      }
    });
  } catch {
    for (const block of blocks) {
      if (!block.isConnected) {
        continue;
      }
      block.className = 'mermaid-block text-sm text-[var(--color-danger)]';
      block.textContent = 'Mermaid 渲染器加载失败。';
    }
  }
}

async function exportDocument(format: ExportExtension): Promise<void> {
  if (exporting.value || !store.activePath) {
    return;
  }

  exportMenuOpen.value = false;
  exporting.value = format;
  try {
    await store.exportActive(format);
  } finally {
    exporting.value = null;
  }
}

function closeExportMenu(event: Event): void {
  const target = event.target;
  if (exportMenuOpen.value && target instanceof Node && !exportMenu.value?.contains(target)) {
    exportMenuOpen.value = false;
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    exportMenuOpen.value = false;
  }
}

function handleEditorScroll(event: Event): void {
  if (!store.preferences.syncScroll || !previewScroll.value) {
    return;
  }
  const ratio = (event as CustomEvent<number>).detail;
  if (!Number.isFinite(ratio)) {
    return;
  }
  const scroller = previewScroll.value;
  const maximum = scroller.scrollHeight - scroller.clientHeight;
  syncingScroll = true;
  scroller.scrollTop = Math.max(0, maximum) * Math.min(1, Math.max(0, ratio));
  globalThis.requestAnimationFrame(() => {
    syncingScroll = false;
  });
}

function handlePreviewScroll(): void {
  const scroller = previewScroll.value;
  if (!scroller || syncingScroll || !store.preferences.syncScroll) {
    return;
  }
  const maximum = scroller.scrollHeight - scroller.clientHeight;
  if (maximum <= 0) {
    return;
  }
  globalThis.dispatchEvent(
    new CustomEvent('markdown-preview-scroll', {
      detail: scroller.scrollTop / maximum,
    }),
  );
}

watch(
  [bodyHtml, () => store.resolvedTheme],
  () => {
    void renderMermaidBlocks();
  },
  { flush: 'post' },
);

onMounted(() => {
  document.addEventListener('pointerdown', closeExportMenu);
  document.addEventListener('keydown', handleEscape);
  globalThis.addEventListener('markdown-editor-scroll', handleEditorScroll);
  void renderMermaidBlocks();
  globalThis.setTimeout(() => preloadPdfExporter(), 700);
});

onBeforeUnmount(() => {
  mermaidRenderSequence += 1;
  document.removeEventListener('pointerdown', closeExportMenu);
  document.removeEventListener('keydown', handleEscape);
  globalThis.removeEventListener('markdown-editor-scroll', handleEditorScroll);
});
</script>

<template>
  <section class="preview-pane" aria-labelledby="preview-pane-title">
    <header class="preview-toolbar">
      <div class="preview-toolbar__heading">
        <button
          v-if="!store.isActiveDocumentLocked"
          class="icon-button preview-toolbar__layout-toggle"
          type="button"
          :title="store.preferences.editorVisible ? '仅显示预览' : '显示编辑器'"
          :aria-label="store.preferences.editorVisible ? '隐藏编辑器，仅显示预览' : '显示编辑器'"
          :aria-pressed="!store.preferences.editorVisible"
          @click="void store.toggleEditorVisibility()"
        >
          <PanelLeftClose v-if="store.preferences.editorVisible" :size="17" aria-hidden="true" />
          <PanelLeftOpen v-else :size="17" aria-hidden="true" />
        </button>
        <span id="preview-pane-title" class="preview-toolbar__title">预览</span>
      </div>

      <div class="preview-toolbar__actions">
        <div ref="exportMenu" class="relative">
          <button
            class="secondary-button button--small !min-h-8 !gap-1.5 !px-2.5"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="exportMenuOpen"
            :disabled="!store.activePath || Boolean(exporting)"
            @click="exportMenuOpen = !exportMenuOpen"
          >
            <LoaderCircle v-if="exporting" :size="15" class="animate-spin" aria-hidden="true" />
            <Download v-else :size="15" aria-hidden="true" />
            <span>{{ exporting ? '生成中…' : '导出' }}</span>
            <ChevronDown :size="14" aria-hidden="true" />
          </button>

          <div
            v-if="exportMenuOpen"
            class="preview-export-menu absolute top-[calc(100%+6px)] right-0 z-[90] w-[220px] rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-popover)]"
            role="menu"
            aria-label="导出当前文档"
            @pointerdown.stop
          >
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              @click="exportDocument('md')"
            >
              <FileText :size="16" aria-hidden="true" />
              <span>Markdown (.md)</span>
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              @click="exportDocument('html')"
            >
              <FileCode2 :size="16" aria-hidden="true" />
              <span>网页 (.html)</span>
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              @click="exportDocument('pdf')"
            >
              <FileType2 :size="16" aria-hidden="true" />
              <span>PDF 文档 (.pdf)</span>
            </button>
            <button
              class="context-menu__item"
              type="button"
              role="menuitem"
              @click="exportDocument('png')"
            >
              <Image :size="16" aria-hidden="true" />
              <span>图片 (.png)</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div ref="previewScroll" class="preview-scroll" @scroll.passive="handlePreviewScroll">
      <article
        v-if="store.hasEditableDocument"
        ref="previewRoot"
        class="markdown-preview"
        :style="previewStyle"
        @click="handlePreviewClick"
      >
        <header>
          <h1>{{ title }}</h1>
          <div
            v-if="
              store.parsedDocument.metadata.date ||
              store.parsedDocument.metadata.category ||
              store.parsedDocument.metadata.tags.length
            "
            class="front-matter-meta !mt-0"
          >
            <span v-if="store.parsedDocument.metadata.date" class="meta-chip gap-1.5">
              <CalendarDays :size="13" aria-hidden="true" />
              {{ store.parsedDocument.metadata.date }}
            </span>
            <span v-if="store.parsedDocument.metadata.category" class="meta-chip gap-1.5">
              <Folder :size="13" aria-hidden="true" />
              {{ store.parsedDocument.metadata.category }}
            </span>
            <button
              v-for="tag in store.parsedDocument.metadata.tags"
              :key="tag"
              class="meta-chip cursor-pointer gap-1.5 bg-transparent hover:border-[var(--color-brand-border)] hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)]"
              type="button"
              :aria-label="`查看标签 ${tag}`"
              @click.stop="store.selectTag(tag)"
            >
              <Tags :size="13" aria-hidden="true" />
              {{ tag }}
            </button>
          </div>
        </header>

        <!-- 内容已经过 Markdown 服务与 DOMPurify 双重清理。 -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="bodyHtml" />

        <section
          v-if="store.activeBacklinks.length"
          class="mt-12 border-t border-[var(--color-border)] pt-6"
          aria-labelledby="backlinks-title"
        >
          <h2 id="backlinks-title" class="!mt-0 flex items-center gap-2 !border-0 !pb-0 text-lg">
            <Link2 :size="18" aria-hidden="true" />
            反向链接
          </h2>
          <p class="text-sm text-[var(--color-text-muted)]">
            {{ store.activeBacklinks.length }} 篇文档链接到当前内容
          </p>
          <div class="backlink-list !px-0">
            <button
              v-for="backlink in store.activeBacklinks"
              :key="`${backlink.sourcePath}:${backlink.lineNumber}`"
              class="backlink-row"
              type="button"
              @click="store.openDocument(backlink.sourcePath)"
            >
              <span class="backlink-row__title">
                {{ backlink.sourceTitle }}
              </span>
              <span class="backlink-row__path">
                {{ backlink.sourcePath }} · 第 {{ backlink.lineNumber }} 行
              </span>
            </button>
          </div>
        </section>
      </article>

      <div v-else class="preview-empty">
        <div>
          <FileText :size="32" class="mx-auto mb-3" aria-hidden="true" />
          <p class="m-0 font-semibold text-[var(--color-text-strong)]">选择文档查看预览</p>
          <p class="mt-2 text-sm">Markdown 内容只会在当前浏览器中渲染</p>
        </div>
      </div>
    </div>
  </section>
</template>
