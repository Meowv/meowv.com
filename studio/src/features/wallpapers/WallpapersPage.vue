<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from 'vue';
import {
  IconChevronDown,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDownload,
  IconPlayerPlay,
  IconMovie,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconX,
} from '@tabler/icons-vue';
import { useWallpapers } from './composables/useWallpapers';
import type { WallpaperItem } from './types';
import './wallpapers.css';

const {
  filters,
  visibleCategories,
  childCategories,
  categoriesLoading,
  items,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMore,
  setFilters,
  retry,
} = useWallpapers();
const selected = ref<WallpaperItem | null>(null);
const downloadBusy = ref(false);
const sentinel = ref<HTMLElement | null>(null);
const categoryBar = ref<HTMLElement | null>(null);
const categoryItems = ref<HTMLElement | null>(null);
const categoryMeasure = ref<HTMLElement | null>(null);
const searchBar = ref<HTMLElement | null>(null);
const moreOpen = ref(false);
const visibleCategoryCount = ref(8);
const pinnedCategoryId = ref<number | null>(null);
const searchExpanded = ref(false);
const searchDraft = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
let observer: IntersectionObserver | null = null;
let categoryResizeObserver: ResizeObserver | null = null;
let pageScrollLock:
  | {
      scrollY: number;
      htmlOverflow: string;
      bodyOverflow: string;
      bodyPosition: string;
      bodyTop: string;
      bodyLeft: string;
      bodyRight: string;
      bodyWidth: string;
    }
  | undefined;

const categoryOptions = computed(() => [...visibleCategories.value, ...childCategories.value]);
const visibleCategoryItems = computed(() => {
  const options = categoryOptions.value;
  const count = Math.min(visibleCategoryCount.value, options.length);
  const selectedId = filters.value.categoryId ?? pinnedCategoryId.value;
  if (!selectedId) return options.slice(0, count);
  const selectedIndex = options.findIndex((category) => category.id === selectedId);
  if (selectedIndex < 0 || selectedIndex < count) return options.slice(0, count);
  const visible = options.slice(0, Math.max(0, count - 1));
  visible.push(options[selectedIndex]!);
  return visible;
});
const moreCategoryItems = computed(() => {
  const visibleIds = new Set(visibleCategoryItems.value.map((category) => category.id));
  return categoryOptions.value.filter((category) => !visibleIds.has(category.id));
});

function observeSentinel(element: Element | ComponentPublicInstance | null): void {
  observer?.disconnect();
  sentinel.value = element instanceof HTMLElement ? element : null;
  if (!(element instanceof HTMLElement)) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    },
    { rootMargin: '800px' },
  );
  observer.observe(element);
  handleScroll();
}

function recomputeCategoryCapacity(): void {
  const container = categoryItems.value;
  const measure = categoryMeasure.value;
  if (!container || !measure) return;
  const available = Math.max(0, container.clientWidth - 66);
  const buttons = [...measure.querySelectorAll<HTMLElement>('[data-category-measure]')];
  if (window.innerWidth <= 760) {
    visibleCategoryCount.value = Math.max(1, buttons.length);
    return;
  }
  let used = 52;
  let count = 0;
  for (const button of buttons) {
    const width = button.offsetWidth + 6;
    if (used + width > available) break;
    used += width;
    count += 1;
  }
  visibleCategoryCount.value = Math.max(1, count);
}

function handleScroll(): void {
  const element = sentinel.value;
  if (!element || !items.value.length || !hasMore.value || loadingMore.value) return;
  if (element.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
}

function handleMediaContextMenu(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function handleMediaInteraction(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function open(item: WallpaperItem): void {
  selected.value = item;
}
function close(): void {
  selected.value = null;
}
function lockPageScroll(): void {
  if (pageScrollLock) return;
  const html = document.documentElement;
  const body = document.body;
  pageScrollLock = {
    scrollY: window.scrollY,
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
  };
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${pageScrollLock.scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
}
function unlockPageScroll(): void {
  if (!pageScrollLock) return;
  const lock = pageScrollLock;
  pageScrollLock = undefined;
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = lock.htmlOverflow;
  body.style.overflow = lock.bodyOverflow;
  body.style.position = lock.bodyPosition;
  body.style.top = lock.bodyTop;
  body.style.left = lock.bodyLeft;
  body.style.right = lock.bodyRight;
  body.style.width = lock.bodyWidth;
  window.scrollTo(0, lock.scrollY);
}
async function expandSearch(): Promise<void> {
  searchExpanded.value = true;
  await nextTick();
  searchInput.value?.focus();
}
function clearSearch(): void {
  searchDraft.value = '';
  searchExpanded.value = false;
  if (filters.value.keyword) void setFilters({ keyword: '' });
}
function handleSearchInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  searchDraft.value = value;
}
function commitSearch(): void {
  const keyword = searchDraft.value.trim();
  if (!keyword) {
    clearSearch();
    return;
  }
  if (filters.value.keyword === keyword) return;
  searchExpanded.value = true;
  void setFilters({ keyword });
}
function sanitizeFilename(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*]/g, '-')
      .split('')
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 80) || 'wallpaper'
  );
}

async function download(item: WallpaperItem, url: string | null, filename: string): Promise<void> {
  if (!url) return;
  if (downloadBusy.value) return;
  downloadBusy.value = true;
  const isVideo = filename.endsWith('.mp4');
  const baseName = item.title
    ? `${sanitizeFilename(item.title)}-${item.id}`
    : `wallpaper-${item.id}`;
  const fallbackName = `${baseName}${isVideo ? '.mp4' : '.jpg'}`;
  try {
    if (isVideo) {
      const downloadUrl = new URL(url);
      downloadUrl.searchParams.set(
        'response-content-disposition',
        `attachment;filename*=UTF-8''${encodeURIComponent(fallbackName)}`,
      );
      const anchor = document.createElement('a');
      anchor.href = downloadUrl.toString();
      anchor.download = fallbackName;
      anchor.rel = 'noreferrer';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      return;
    }
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fallbackName;
    anchor.rel = 'noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  } catch {
    // CDN 未开放 CORS 时无法在前端转 Blob，退回打开原始地址。
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    downloadBusy.value = false;
  }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}
function handleDocumentPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('.wallpapers-more-wrap')) moreOpen.value = false;
  if (
    searchExpanded.value &&
    !searchDraft.value.trim() &&
    !event.target.closest('.wallpapers-search')
  ) {
    searchExpanded.value = false;
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  handleScroll();
  categoryResizeObserver = new ResizeObserver(recomputeCategoryCapacity);
  if (categoryBar.value) categoryResizeObserver.observe(categoryBar.value);
  if (categoryItems.value) categoryResizeObserver.observe(categoryItems.value);
  if (searchBar.value) categoryResizeObserver.observe(searchBar.value);
  void nextTick(recomputeCategoryCapacity);
});
onBeforeUnmount(() => {
  unlockPageScroll();
  observer?.disconnect();
  categoryResizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleScroll);
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});

watch(categoryOptions, () => void nextTick(recomputeCategoryCapacity), { deep: true });
watch(searchExpanded, () => void nextTick(recomputeCategoryCapacity));
watch(selected, (item) => {
  if (item) lockPageScroll();
  else unlockPageScroll();
});
watch(
  () => [items.value.length, loading.value, loadingMore.value, hasMore.value],
  () => void nextTick(handleScroll),
);
watch(
  () => [filters.value.device, filters.value.content],
  () => {
    pinnedCategoryId.value = null;
    moreOpen.value = false;
  },
);
watch(
  () => filters.value.keyword,
  (keyword) => {
    searchDraft.value = keyword;
    if (keyword.trim()) searchExpanded.value = true;
    else searchExpanded.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <main class="wallpapers-page">
    <section ref="categoryBar" class="wallpapers-category-bar" aria-label="壁纸分类">
      <div ref="categoryItems" class="wallpapers-category-items">
        <template v-if="categoriesLoading">
          <span v-for="index in 6" :key="index" class="wallpapers-category-skeleton" />
        </template>
        <template v-else>
          <button
            :class="{ active: !filters.categoryId }"
            @click="setFilters({ categoryId: null })"
          >
            全部
          </button>
          <button
            v-for="category in visibleCategoryItems"
            :key="category.id"
            :class="{ active: filters.categoryId === category.id }"
            @click="
              pinnedCategoryId = category.id;
              setFilters({ categoryId: category.id });
            "
          >
            {{ category.name }}
          </button>
          <div v-if="moreCategoryItems.length" class="wallpapers-more-wrap">
            <button class="wallpapers-more-button" @click="moreOpen = !moreOpen">
              更多 {{ moreCategoryItems.length }}<IconChevronDown :size="15" />
            </button>
            <div v-if="moreOpen" class="wallpapers-more-menu">
              <button
                v-for="category in moreCategoryItems"
                :key="category.id"
                :class="{ active: filters.categoryId === category.id }"
                @click="
                  pinnedCategoryId = category.id;
                  moreOpen = false;
                  setFilters({ categoryId: category.id });
                "
              >
                {{ category.name }}
              </button>
            </div>
          </div>
          <div ref="categoryMeasure" class="wallpapers-category-measure" aria-hidden="true">
            <button v-for="category in categoryOptions" :key="category.id" data-category-measure>
              {{ category.name }}
            </button>
          </div>
        </template>
      </div>
      <div class="wallpapers-filters">
        <div class="wallpapers-filter-group" aria-label="设备类型">
          <div class="wallpapers-segment">
            <button
              :aria-label="filters.device === 'desktop' ? '电脑壁纸' : '切换到电脑壁纸'"
              :title="filters.device === 'desktop' ? '电脑壁纸' : '电脑壁纸'"
              :class="{ active: filters.device === 'desktop' }"
              @click="setFilters({ device: 'desktop' })"
            >
              <IconDeviceDesktop :size="18" />
            </button>
            <button
              :aria-label="filters.device === 'mobile' ? '手机壁纸' : '切换到手机壁纸'"
              :title="filters.device === 'mobile' ? '手机壁纸' : '手机壁纸'"
              :class="{ active: filters.device === 'mobile' }"
              @click="setFilters({ device: 'mobile' })"
            >
              <IconDeviceMobile :size="18" />
            </button>
          </div>
        </div>
        <div class="wallpapers-filter-group" aria-label="内容类型">
          <div class="wallpapers-segment">
            <button
              :aria-label="filters.content === 'dynamic' ? '动态壁纸' : '切换到动态壁纸'"
              title="动态壁纸"
              :class="{ active: filters.content === 'dynamic' }"
              @click="setFilters({ content: 'dynamic' })"
            >
              <IconMovie :size="18" />
            </button>
            <button
              :aria-label="filters.content === 'static' ? '静态壁纸' : '切换到静态壁纸'"
              title="静态壁纸"
              :class="{ active: filters.content === 'static' }"
              @click="setFilters({ content: 'static' })"
            >
              <IconPhoto :size="18" />
            </button>
          </div>
        </div>
        <div
          ref="searchBar"
          class="wallpapers-search"
          :class="{ 'wallpapers-search--expanded': searchExpanded }"
          @transitionend="recomputeCategoryCapacity"
        >
          <button
            v-if="!searchExpanded"
            type="button"
            class="wallpapers-search-toggle"
            aria-label="搜索壁纸"
            title="搜索壁纸"
            @click="expandSearch"
          >
            <IconSearch :size="18" />
          </button>
          <template v-else>
            <IconSearch :size="18" />
            <input
              ref="searchInput"
              :value="searchDraft"
              placeholder="搜索壁纸，关键词…"
              @input="handleSearchInput"
              @change="commitSearch"
              @keyup.enter="commitSearch"
            />
            <button
              v-if="searchDraft"
              type="button"
              class="wallpapers-search-clear"
              aria-label="清空搜索"
              title="清空搜索"
              @click="clearSearch"
            >
              <IconX :size="18" />
            </button>
          </template>
        </div>
      </div>
    </section>

    <div v-if="error && !items.length" class="wallpapers-error">
      <p>{{ error }}</p>
      <button @click="retry"><IconRefresh :size="18" />重试</button>
    </div>
    <div v-else-if="loading && !items.length" class="wallpapers-grid" aria-busy="true">
      <div v-for="index in 12" :key="index" class="wallpapers-skeleton" />
    </div>
    <div v-else-if="!items.length" class="wallpapers-empty">没有找到符合条件的壁纸。</div>
    <div v-else class="wallpapers-grid">
      <article v-for="item in items" :key="item.id" class="wallpapers-card" @click="open(item)">
        <img
          v-if="item.coverUrl"
          :src="item.coverUrl"
          :alt="item.title || '壁纸'"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
        <div v-else class="wallpapers-card-placeholder">暂无预览</div>
        <span
          v-if="filters.content === 'dynamic' && item.contentType === 'dynamic'"
          class="wallpapers-card-badge"
          ><IconPlayerPlay :size="14" />动态</span
        >
        <span v-if="item.contentType === 'dynamic'" class="wallpapers-card-play" aria-hidden="true">
          <IconPlayerPlay :size="24" fill="currentColor" />
        </span>
        <div class="wallpapers-card-info">
          <strong v-if="item.title" class="wallpapers-card-title">{{ item.title }}</strong>
          <div v-if="item.tags.length" class="wallpapers-card-tags">
            <span v-for="tag in item.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
            <span v-if="item.tags.length > 3">+{{ item.tags.length - 3 }}</span>
          </div>
        </div>
      </article>
    </div>
    <div :ref="observeSentinel" class="wallpapers-sentinel" />
    <div
      v-if="(loading || loadingMore) && items.length"
      class="wallpapers-grid wallpapers-grid-loading-more"
      aria-busy="true"
    >
      <div v-for="index in 5" :key="index" class="wallpapers-skeleton" />
    </div>
    <p v-else-if="!hasMore && items.length" class="wallpapers-end">已经到底了</p>

    <div
      v-if="selected"
      class="wallpapers-lightbox"
      role="dialog"
      aria-modal="true"
      @click.self="close"
      @wheel.stop.prevent
      @touchmove.stop.prevent
    >
      <button class="wallpapers-lightbox-close" title="关闭" @click="close">
        <IconX :size="18" />
      </button>
      <div class="wallpapers-lightbox-download" @click.stop>
        <button
          v-if="selected.previewVideoUrl"
          class="wallpapers-lightbox-download-trigger"
          title="下载动态壁纸"
          :disabled="downloadBusy"
          @click="download(selected, selected.previewVideoUrl, `wallpaper-${selected.id}.mp4`)"
        >
          <span class="wallpapers-download-icon" aria-hidden="true">
            <IconDownload :size="18" />
            <IconMovie class="wallpapers-download-icon-type" :size="11" />
          </span>
        </button>
        <button
          v-if="selected.coverUrl"
          class="wallpapers-lightbox-download-trigger"
          :disabled="downloadBusy"
          title="下载静态壁纸"
          @click="download(selected, selected.coverUrl, `wallpaper-${selected.id}.jpg`)"
        >
          <span class="wallpapers-download-icon" aria-hidden="true">
            <IconDownload :size="18" />
            <IconPhoto class="wallpapers-download-icon-type" :size="11" />
          </span>
        </button>
      </div>
      <video
        v-if="selected.contentType === 'dynamic' && selected.previewVideoUrl"
        :src="selected.previewVideoUrl"
        autoplay
        loop
        muted
        playsinline
        preload="metadata"
        disablepictureinpicture
        controlslist="nodownload noplaybackrate noremoteplayback"
        tabindex="-1"
        aria-label="动态壁纸预览"
        draggable="false"
        referrerpolicy="no-referrer"
        @contextmenu="handleMediaContextMenu"
        @click="handleMediaInteraction"
        @dblclick="handleMediaInteraction"
        @mousedown="handleMediaInteraction"
        @mouseup="handleMediaInteraction"
        @pointerdown="handleMediaInteraction"
        @pointerup="handleMediaInteraction"
        @touchstart="handleMediaInteraction"
        @touchend="handleMediaInteraction"
        @keydown="handleMediaInteraction"
      />
      <img
        v-else-if="selected.coverUrl"
        :src="selected.coverUrl"
        :alt="selected.title || '壁纸预览'"
        draggable="false"
        referrerpolicy="no-referrer"
        @contextmenu="handleMediaContextMenu"
        @dragstart="handleMediaInteraction"
        @click="handleMediaInteraction"
        @dblclick="handleMediaInteraction"
        @mousedown="handleMediaInteraction"
        @mouseup="handleMediaInteraction"
        @pointerdown="handleMediaInteraction"
        @pointerup="handleMediaInteraction"
        @touchstart="handleMediaInteraction"
        @touchend="handleMediaInteraction"
      />
    </div>
  </main>
</template>
