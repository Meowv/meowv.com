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
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDownload,
  IconLoader2,
  IconPlayerPlay,
  IconMovie,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconWallpaper,
  IconX,
} from '@tabler/icons-vue';
import { useWallpapers } from './composables/useWallpapers';
import { useLivewallPromo } from './app-promo/useLivewallPromo';
import { resolveLivewallPromoVisibility } from './app-promo/livewall-promo';
import LivewallPromoPopup from './app-promo/LivewallPromoPopup.vue';
import LivewallPromoLightboxCta from './app-promo/LivewallPromoLightboxCta.vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
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
const {
  enabled: backgroundEnabled,
  activeWallpaperId,
  pendingSource: pendingBackgroundSource,
  isLoading: backgroundLoading,
  requestWallpaperBackground,
  errorMessage: backgroundErrorMessage,
} = useToolsBackground();
const selected = ref<WallpaperItem | null>(null);
// 桌面 App 推广位：显隐规则集中在 resolveLivewallPromoVisibility，页面只负责把 device 传进去。
const {
  model: livewallModel,
  dismissed: livewallDismissed,
  dismiss: dismissLivewallPromo,
} = useLivewallPromo();
const livewallPromoVisibility = computed(() =>
  resolveLivewallPromoVisibility({
    device: filters.value.device,
    dismissed: livewallDismissed.value,
  }),
);
const downloadBusy = ref(false);
const navigationBusy = ref(false);
const mediaLoading = ref(false);
const mediaLoadFailed = ref(false);
const backgroundStatusMessage = ref('');
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
let cardObserver: IntersectionObserver | null = null;
const observedCardIds = new WeakMap<Element, number>();
const lazyCardIds = ref(new Set<number>());
let categoryResizeObserver: ResizeObserver | null = null;
let backgroundStatusTimer: ReturnType<typeof setTimeout> | undefined;
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

function markCardAsVisible(id: number, element?: Element): void {
  const next = new Set(lazyCardIds.value);
  next.add(id);
  lazyCardIds.value = next;
  if (element) cardObserver?.unobserve(element);
}

function observeCard(element: Element | ComponentPublicInstance | null, item: WallpaperItem): void {
  if (!(element instanceof HTMLElement) || !item.coverUrl || lazyCardIds.value.has(item.id)) return;
  if (!('IntersectionObserver' in window)) {
    markCardAsVisible(item.id);
    return;
  }
  if (!cardObserver) {
    cardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = observedCardIds.get(entry.target);
          if (id === undefined) continue;
          markCardAsVisible(id, entry.target);
          observedCardIds.delete(entry.target);
        }
      },
      { rootMargin: '300px 0px' },
    );
  }
  observedCardIds.set(element, item.id);
  cardObserver.observe(element);
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

function scrollCategoryButtonIntoView(button: HTMLElement): void {
  const container = button.closest<HTMLElement>('.wallpapers-category-items');
  if (!container || container.scrollWidth <= container.clientWidth) return;
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  const targetLeft = button.offsetLeft - (container.clientWidth - button.offsetWidth) / 2;
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));
  container.scrollLeft = nextScrollLeft;
  container.scrollTo({
    left: nextScrollLeft,
    behavior: 'smooth',
  });
}

function scrollSelectedCategoryIntoView(): void {
  const container = document.querySelector<HTMLElement>('.wallpapers-category-items');
  const selected = container?.querySelector<HTMLElement>(':scope > button.active');
  if (selected) scrollCategoryButtonIntoView(selected);
}

function scheduleSelectedCategoryScroll(): void {
  void nextTick(() => {
    scrollSelectedCategoryIntoView();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollSelectedCategoryIntoView);
    });
  });
}

async function selectCategory(categoryId: number | null, event?: MouseEvent): Promise<void> {
  pinnedCategoryId.value = categoryId;
  const clickedButton = event?.currentTarget;
  if (clickedButton instanceof HTMLElement) scrollCategoryButtonIntoView(clickedButton);
  const update = setFilters({ categoryId });
  scheduleSelectedCategoryScroll();
  await update;
  scheduleSelectedCategoryScroll();
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
async function setSelectedAsBackground(): Promise<void> {
  const item = selected.value;
  if (!item || !canSetSelectedAsBackground.value || setBackgroundDisabled.value) return;
  backgroundStatusMessage.value = '';
  clearTimeout(backgroundStatusTimer);
  const success = await requestWallpaperBackground(item);
  if (selected.value?.id !== item.id) return;
  backgroundStatusMessage.value = success
    ? '已设为壁纸'
    : backgroundErrorMessage.value || '设置视频背景失败。';
  backgroundStatusTimer = setTimeout(() => {
    backgroundStatusMessage.value = '';
  }, 2400);
}
const selectedIndex = computed(() =>
  selected.value ? items.value.findIndex((item) => item.id === selected.value?.id) : -1,
);
const canNavigateNext = computed(
  () => selectedIndex.value >= 0 && (selectedIndex.value < items.value.length - 1 || hasMore.value),
);
const canSetSelectedAsBackground = computed(
  () =>
    selected.value?.deviceType === 'desktop' &&
    selected.value.contentType === 'dynamic' &&
    Boolean(selected.value.previewVideoUrl),
);
const selectedIsBackground = computed(
  () =>
    canSetSelectedAsBackground.value &&
    backgroundEnabled.value &&
    activeWallpaperId.value === selected.value?.id,
);
const selectedBackgroundPending = computed(
  () =>
    canSetSelectedAsBackground.value &&
    pendingBackgroundSource.value?.wallpaperId === selected.value?.id,
);
const setBackgroundDisabled = computed(
  () =>
    !canSetSelectedAsBackground.value ||
    selectedBackgroundPending.value ||
    selectedIsBackground.value ||
    backgroundLoading.value ||
    navigationBusy.value ||
    mediaLoading.value ||
    mediaLoadFailed.value,
);
async function navigate(delta: -1 | 1): Promise<void> {
  if (!selected.value || navigationBusy.value) return;
  const currentId = selected.value.id;
  const currentIndex = items.value.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return;
  if (delta < 0) {
    const previous = items.value[currentIndex - 1];
    if (previous) selected.value = previous;
    return;
  }
  const next = items.value[currentIndex + 1];
  if (next) {
    selected.value = next;
    return;
  }
  if (!hasMore.value) return;
  navigationBusy.value = true;
  try {
    await loadMore();
    if (selected.value?.id !== currentId) return;
    const refreshedIndex = items.value.findIndex((item) => item.id === currentId);
    const loadedNext = refreshedIndex >= 0 ? items.value[refreshedIndex + 1] : undefined;
    if (loadedNext) selected.value = loadedNext;
  } finally {
    navigationBusy.value = false;
  }
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
    if (import.meta.env.DEV) {
      const params = new URLSearchParams({ url, filename: fallbackName });
      const anchor = document.createElement('a');
      anchor.href = `/__wallpaper-download?${params.toString()}`;
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
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    void navigate(-1);
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    void navigate(1);
  }
}
function handleMediaLoaded(): void {
  mediaLoading.value = false;
  mediaLoadFailed.value = false;
}
function handleMediaLoadError(): void {
  mediaLoading.value = false;
  mediaLoadFailed.value = true;
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
  clearTimeout(backgroundStatusTimer);
  unlockPageScroll();
  observer?.disconnect();
  cardObserver?.disconnect();
  categoryResizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleScroll);
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});

watch(
  [categoryOptions, () => filters.value.categoryId],
  () =>
    void nextTick(() => {
      recomputeCategoryCapacity();
      scheduleSelectedCategoryScroll();
    }),
  { deep: true },
);
watch(searchExpanded, () => void nextTick(recomputeCategoryCapacity));
watch(selected, (item) => {
  mediaLoading.value = Boolean(item?.coverUrl || item?.previewVideoUrl);
  mediaLoadFailed.value = false;
  backgroundStatusMessage.value = '';
  clearTimeout(backgroundStatusTimer);
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
          <button :class="{ active: !filters.categoryId }" @click="selectCategory(null, $event)">
            全部
          </button>
          <button
            v-for="category in visibleCategoryItems"
            :key="category.id"
            :class="{ active: filters.categoryId === category.id }"
            @click="selectCategory(category.id, $event)"
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
                  moreOpen = false;
                  selectCategory(category.id, $event);
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
    <div v-else-if="!items.length" class="wallpapers-empty">没有找到符合条件的壁纸</div>
    <div v-else class="wallpapers-grid">
      <article
        v-for="item in items"
        :key="item.id"
        :ref="(element) => observeCard(element, item)"
        class="wallpapers-card"
        @click="open(item)"
      >
        <img
          v-if="item.coverUrl && lazyCardIds.has(item.id)"
          :src="item.coverUrl"
          :alt="item.title || '壁纸'"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />
        <div v-else-if="item.coverUrl" class="wallpapers-card-placeholder">加载预览中…</div>
        <div v-else class="wallpapers-card-placeholder">暂无预览</div>
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
      @wheel.stop.prevent
      @touchmove.stop.prevent
    >
      <button class="wallpapers-lightbox-close" title="关闭" @click="close">
        <IconX :size="18" />
      </button>
      <button
        v-if="selectedIndex > 0"
        class="wallpapers-lightbox-nav wallpapers-lightbox-nav--previous"
        type="button"
        title="上一张"
        aria-label="上一张"
        :disabled="navigationBusy"
        @click.stop="void navigate(-1)"
      >
        <IconChevronLeft :size="24" />
      </button>
      <button
        v-if="canNavigateNext"
        class="wallpapers-lightbox-nav wallpapers-lightbox-nav--next"
        type="button"
        title="下一张"
        aria-label="下一张"
        :disabled="navigationBusy"
        @click.stop="void navigate(1)"
      >
        <IconChevronRight :size="24" />
      </button>
      <div class="wallpapers-lightbox-download" @click.stop>
        <button
          v-if="canSetSelectedAsBackground"
          class="wallpapers-lightbox-download-trigger"
          :class="{ 'is-active': selectedIsBackground }"
          type="button"
          :disabled="setBackgroundDisabled"
          :aria-label="
            selectedIsBackground
              ? '当前视频已设为壁纸'
              : selectedBackgroundPending
                ? '正在设为壁纸'
                : '设为壁纸'
          "
          :aria-pressed="selectedIsBackground"
          :title="
            selectedIsBackground
              ? '当前视频已设为壁纸'
              : selectedBackgroundPending
                ? '正在设为壁纸'
                : '设为壁纸'
          "
          @click="void setSelectedAsBackground()"
        >
          <IconLoader2
            v-if="selectedBackgroundPending"
            class="wallpapers-action-spinning"
            :size="18"
          />
          <IconCheck v-else-if="selectedIsBackground" :size="18" />
          <IconWallpaper v-else :size="18" />
        </button>
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
        <LivewallPromoLightboxCta
          v-if="livewallPromoVisibility.lightboxCta"
          :model="livewallModel"
        />
      </div>
      <span
        v-if="backgroundStatusMessage"
        class="wallpapers-lightbox-background-status"
        role="status"
      >
        {{ backgroundStatusMessage }}
      </span>
      <video
        v-if="selected.contentType === 'dynamic' && selected.previewVideoUrl"
        :key="`video-${selected.id}`"
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
        @loadeddata="handleMediaLoaded"
        @error="handleMediaLoadError"
      />
      <img
        v-else-if="selected.coverUrl"
        :key="`image-${selected.id}`"
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
        @load="handleMediaLoaded"
        @error="handleMediaLoadError"
      />
      <div v-if="mediaLoading || navigationBusy" class="wallpapers-lightbox-loading">
        <span class="wallpapers-lightbox-loading-spinner" aria-hidden="true" />
        <span>加载中…</span>
      </div>
      <div v-else-if="mediaLoadFailed" class="wallpapers-lightbox-loading">
        <span>预览加载失败</span>
      </div>
    </div>

    <LivewallPromoPopup
      v-if="livewallPromoVisibility.popup"
      :model="livewallModel"
      @dismiss="dismissLivewallPromo"
    />
  </main>
</template>
