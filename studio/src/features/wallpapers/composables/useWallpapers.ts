import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  WallpaperCategory,
  WallpaperContent,
  WallpaperDevice,
  WallpaperItem,
  WallpaperPageResult,
  WallpaperQuery,
  WallpaperCursor,
} from '../types';
import { WallpaperRepository } from '../services/wallpaperRepository';

const STORAGE_KEY = 'meowv-studio:wallpapers:filters';
const PAGE_CACHE_KEY = 'meowv-studio:wallpapers:pages:v1';
const defaults = {
  device: 'desktop' as WallpaperDevice,
  content: 'dynamic' as WallpaperContent,
  categoryId: null as number | null,
  keyword: '',
};

function parseDevice(value: unknown): WallpaperDevice {
  return value === 'mobile' ? 'mobile' : 'desktop';
}

function parseContent(value: unknown): WallpaperContent {
  return value === 'static' ? 'static' : 'dynamic';
}

function pageCacheKey(value: {
  device: WallpaperDevice;
  content: WallpaperContent;
  categoryId: number | null;
  keyword: string;
}): string {
  return JSON.stringify([value.device, value.content, value.categoryId, value.keyword.trim()]);
}

export function useWallpapers() {
  const route = useRoute();
  const router = useRouter();
  const repository = new WallpaperRepository();
  const filters = ref({ ...defaults });
  const categories = ref<WallpaperCategory[]>([]);
  const categoriesLoading = ref(false);
  const items = ref<WallpaperItem[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(true);
  let cursor: WallpaperCursor | null = null;
  let queryToken = 0;

  function readCachedPage(value: typeof defaults): WallpaperPageResult | null {
    try {
      const raw = localStorage.getItem(PAGE_CACHE_KEY);
      if (!raw) return null;
      const pages = JSON.parse(raw) as Record<
        string,
        { savedAt?: number; result?: WallpaperPageResult }
      >;
      const entry = pages[pageCacheKey(value)];
      if (!entry?.result || !Array.isArray(entry.result.items)) return null;
      return entry.result;
    } catch {
      return null;
    }
  }

  function saveCachedPage(value: typeof defaults, result: WallpaperPageResult): void {
    try {
      const raw = localStorage.getItem(PAGE_CACHE_KEY);
      const pages = raw
        ? (JSON.parse(raw) as Record<string, { savedAt?: number; result?: WallpaperPageResult }>)
        : {};
      pages[pageCacheKey(value)] = { savedAt: Date.now(), result };
      const entries = Object.entries(pages)
        .sort(([, left], [, right]) => (right.savedAt ?? 0) - (left.savedAt ?? 0))
        .slice(0, 8);
      localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* 忽略不可用的本地存储 */
    }
  }

  function loadStoredFilters(): typeof defaults {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw) as Partial<typeof defaults>;
      return {
        ...defaults,
        ...parsed,
        device: parseDevice(parsed.device),
        content: parseContent(parsed.content),
      };
    } catch {
      return { ...defaults };
    }
  }

  function readFilters(): typeof defaults {
    const stored = loadStoredFilters();
    const query = route.query;
    const category = Number(query.category);
    return {
      device: query.device ? parseDevice(query.device) : stored.device,
      content: query.content ? parseContent(query.content) : stored.content,
      categoryId:
        Number.isFinite(category) && category > 0
          ? category
          : query.category
            ? null
            : stored.categoryId,
      keyword: typeof query.keyword === 'string' ? query.keyword : stored.keyword,
    };
  }

  function persistAndSync(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters.value));
    } catch {
      /* 忽略不可用的本地存储 */
    }
    void router.replace({
      query: {
        device: filters.value.device,
        content: filters.value.content,
        ...(filters.value.categoryId ? { category: String(filters.value.categoryId) } : {}),
        ...(filters.value.keyword.trim() ? { keyword: filters.value.keyword.trim() } : {}),
      },
    });
  }

  const visibleCategories = computed(() =>
    categories.value.filter((category) => category.level === 1),
  );
  const childCategories = computed(() =>
    filters.value.categoryId
      ? categories.value.filter((category) => category.parentId === filters.value.categoryId)
      : [],
  );

  async function load(first = true, preserveItems = false): Promise<void> {
    const token = ++queryToken;
    if (first) {
      if (!preserveItems) items.value = [];
      cursor = null;
      hasMore.value = true;
      loading.value = true;
    } else loadingMore.value = true;
    error.value = null;
    const query: WallpaperQuery = {
      ...filters.value,
      keyword: filters.value.keyword.trim() || null,
      cursor,
      pageSize: 20,
    };
    try {
      const result = await repository.query(query);
      if (token !== queryToken) return;
      items.value = first ? result.items : [...items.value, ...result.items];
      cursor = result.nextCursor;
      hasMore.value = result.hasMore;
      if (first) saveCachedPage(filters.value, result);
    } catch (reason) {
      if (token === queryToken)
        error.value = reason instanceof Error ? reason.message : '壁纸加载失败。';
    } finally {
      if (token === queryToken) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function initialize(): Promise<void> {
    filters.value = readFilters();
    const cached = readCachedPage(filters.value);
    let hasBootstrap = false;
    if (cached) {
      items.value = cached.items;
      cursor = cached.nextCursor;
      hasMore.value = cached.hasMore;
    }
    loading.value = true;
    categoriesLoading.value = true;
    try {
      const useBootstrap =
        !cached &&
        filters.value.device === 'desktop' &&
        filters.value.content === 'dynamic' &&
        filters.value.categoryId === null &&
        !filters.value.keyword.trim();
      const bootstrapPromise = useBootstrap ? repository.bootstrap() : null;
      const categoriesPromise = repository.categories(filters.value.device, filters.value.content);
      const initPromise = repository.init();
      if (bootstrapPromise) {
        const bootstrap = await bootstrapPromise;
        if (bootstrap.items.length) {
          items.value = bootstrap.items;
          hasBootstrap = true;
        }
      }
      categories.value = await categoriesPromise;
      categoriesLoading.value = false;
      await initPromise;
      await load(true, Boolean(cached) || hasBootstrap);
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '壁纸数据库加载失败。';
      loading.value = false;
    } finally {
      categoriesLoading.value = false;
    }
  }

  async function setFilters(next: Partial<typeof defaults>): Promise<void> {
    filters.value = { ...filters.value, ...next };
    if (next.device || next.content) filters.value.categoryId = null;
    persistAndSync();
    const cached = readCachedPage(filters.value);
    if (cached) {
      items.value = cached.items;
      cursor = cached.nextCursor;
      hasMore.value = cached.hasMore;
    } else {
      items.value = [];
      hasMore.value = true;
    }
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    try {
      if (next.device || next.content) {
        categories.value = await repository.categories(filters.value.device, filters.value.content);
      }
      await load(true, Boolean(cached));
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : '壁纸加载失败。';
      loading.value = false;
      loadingMore.value = false;
    } finally {
      categoriesLoading.value = false;
    }
  }

  onBeforeUnmount(() => repository.dispose());
  watch(
    () => route.query,
    () => {
      if (route.name === 'wallpapers') filters.value = readFilters();
    },
    { deep: true },
  );
  void initialize();

  return {
    filters,
    categories,
    categoriesLoading,
    visibleCategories,
    childCategories,
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore: () =>
      hasMore.value && !loading.value && !loadingMore.value && items.value.length
        ? load(false)
        : Promise.resolve(),
    setFilters,
    retry: () => load(),
  };
}
