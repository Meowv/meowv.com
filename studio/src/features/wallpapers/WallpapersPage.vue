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
  IconDownload,
  IconPlayerPlay,
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
const sentinel = ref<HTMLElement | null>(null);
const categoryBar = ref<HTMLElement | null>(null);
const categoryMeasure = ref<HTMLElement | null>(null);
const moreOpen = ref(false);
const visibleCategoryCount = ref(8);
const pinnedCategoryId = ref<number | null>(null);
let observer: IntersectionObserver | null = null;
let categoryResizeObserver: ResizeObserver | null = null;

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
      if (entries[0]?.isIntersecting && items.value.length) void loadMore();
    },
    { rootMargin: '800px' },
  );
  observer.observe(element);
}

function recomputeCategoryCapacity(): void {
  const container = categoryBar.value;
  const measure = categoryMeasure.value;
  if (!container || !measure) return;
  const available = Math.max(0, container.clientWidth - 78);
  const buttons = [...measure.querySelectorAll<HTMLElement>('[data-category-measure]')];
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

function open(item: WallpaperItem): void {
  selected.value = item;
}
function close(): void {
  selected.value = null;
}
function download(item: WallpaperItem, url: string | null, filename: string): void {
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noreferrer';
  anchor.target = '_blank';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  handleScroll();
  categoryResizeObserver = new ResizeObserver(recomputeCategoryCapacity);
  if (categoryBar.value) categoryResizeObserver.observe(categoryBar.value);
  void nextTick(recomputeCategoryCapacity);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  categoryResizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleScroll);
});

watch(categoryOptions, () => void nextTick(recomputeCategoryCapacity), { deep: true });
watch(
  () => [filters.value.device, filters.value.content],
  () => {
    pinnedCategoryId.value = null;
    moreOpen.value = false;
  },
);
</script>

<template>
  <main class="wallpapers-page">
    <header class="wallpapers-toolbar">
      <div class="wallpapers-filters">
        <div class="wallpapers-filter-group" aria-label="设备类型">
          <div class="wallpapers-segment">
            <button
              :class="{ active: filters.device === 'desktop' }"
              @click="setFilters({ device: 'desktop' })"
            >
              电脑
            </button>
            <button
              :class="{ active: filters.device === 'mobile' }"
              @click="setFilters({ device: 'mobile' })"
            >
              手机
            </button>
          </div>
        </div>
        <div class="wallpapers-filter-group" aria-label="内容类型">
          <div class="wallpapers-segment">
            <button
              :class="{ active: filters.content === 'dynamic' }"
              @click="setFilters({ content: 'dynamic' })"
            >
              动态
            </button>
            <button
              :class="{ active: filters.content === 'static' }"
              @click="setFilters({ content: 'static' })"
            >
              静态
            </button>
          </div>
        </div>
        <label class="wallpapers-search"
          ><IconSearch :size="18" /><input
            :value="filters.keyword"
            placeholder="搜索标题、作者或标签"
            @change="setFilters({ keyword: ($event.target as HTMLInputElement).value })"
        /></label>
      </div>
    </header>

    <section ref="categoryBar" class="wallpapers-category-bar" aria-label="壁纸分类">
      <template v-if="categoriesLoading">
        <span v-for="index in 6" :key="index" class="wallpapers-category-skeleton" />
      </template>
      <template v-else>
        <button :class="{ active: !filters.categoryId }" @click="setFilters({ categoryId: null })">
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
    >
      <button class="wallpapers-lightbox-close" title="关闭" @click="close">
        <IconX :size="22" />
      </button>
      <video
        v-if="selected.contentType === 'dynamic' && selected.previewVideoUrl"
        :src="selected.previewVideoUrl"
        controls
        autoplay
        muted
        playsinline
        preload="metadata"
        referrerpolicy="no-referrer"
      />
      <img
        v-else-if="selected.coverUrl"
        :src="selected.coverUrl"
        :alt="selected.title || '壁纸预览'"
        referrerpolicy="no-referrer"
      />
      <div class="wallpapers-lightbox-actions">
        <button
          :disabled="!selected.coverUrl"
          @click="download(selected, selected.coverUrl, `wallpaper-${selected.id}.jpg`)"
        >
          <IconDownload :size="18" />下载图片</button
        ><button
          v-if="selected.previewVideoUrl"
          @click="download(selected, selected.previewVideoUrl, `wallpaper-${selected.id}.mp4`)"
        >
          <IconDownload :size="18" />下载视频
        </button>
      </div>
    </div>
  </main>
</template>
