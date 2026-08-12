import { computed, shallowRef } from 'vue';
import { load as loadYaml } from 'js-yaml';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  toolCategories,
  tools as internalTools,
  type LinkToolConfig,
  type ToolConfig,
  type ToolIconSource,
} from '@/features/tools/tools';

export interface BookmarkConfig {
  id: string;
  name: string;
  icon: ToolIconSource;
  url: string;
}

interface ParsedCatalog {
  links: LinkToolConfig[];
  aiSites: BookmarkConfig[];
  bookmarks: BookmarkConfig[];
}

const LINKS_CONFIG_URL = '/data/tools-links.yaml';
const LINKS_CACHE_KEY = `${STORAGE_POLICY.preferences}:tools-links-cache`;
const TOOL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const linkTools = shallowRef<LinkToolConfig[]>([]);
const aiSites = shallowRef<BookmarkConfig[]>([]);
const bookmarks = shallowRef<BookmarkConfig[]>([]);
let initialized = false;
let loading: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllowedUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'https:' || parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

function parseIcon(value: unknown): ToolIconSource | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!isRecord(value) || typeof value.url !== 'string') return null;
  const url = value.url.trim();
  return url && isAllowedUrl(url) ? { url } : null;
}

function parseCatalog(payload: unknown): ParsedCatalog | null {
  if (!isRecord(payload) || !isRecord(payload.categories)) return null;

  const knownIds = new Set(internalTools.map((tool) => tool.id));
  const links: LinkToolConfig[] = [];

  for (const category of toolCategories) {
    const values = payload.categories[category.id];
    if (!Array.isArray(values)) continue;

    for (const value of values) {
      if (!isRecord(value)) continue;
      const id = typeof value.id === 'string' ? value.id.trim() : '';
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      const description = typeof value.description === 'string' ? value.description.trim() : '';
      const url = typeof value.url === 'string' ? value.url.trim() : '';
      const icon = parseIcon(value.icon);

      if (
        !TOOL_ID_PATTERN.test(id) ||
        knownIds.has(id) ||
        !name ||
        !description ||
        !url ||
        !isAllowedUrl(url) ||
        !icon
      ) {
        continue;
      }

      knownIds.add(id);
      links.push({
        type: 'link',
        id,
        category: category.id,
        name,
        description,
        icon,
        url,
      });
    }
  }

  function parseSites(values: unknown, fallbackIcon: ToolIconSource): BookmarkConfig[] {
    const sites: BookmarkConfig[] = [];
    for (const value of Array.isArray(values) ? values : []) {
      if (!isRecord(value)) continue;
      const id = typeof value.id === 'string' ? value.id.trim() : '';
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      const url = typeof value.url === 'string' ? value.url.trim() : '';
      const icon = value.icon === undefined ? fallbackIcon : parseIcon(value.icon);

      if (
        !TOOL_ID_PATTERN.test(id) ||
        knownIds.has(id) ||
        !name ||
        !url ||
        !isAllowedUrl(url) ||
        !icon
      ) {
        continue;
      }

      knownIds.add(id);
      sites.push({ id, name, icon, url });
    }
    return sites;
  }

  const parsedAiSites = parseSites(payload.categories.ai, 'ai');
  const parsedBookmarks = parseSites(payload.categories.bookmarks, 'bookmark');

  return { links, aiSites: parsedAiSites, bookmarks: parsedBookmarks };
}

function mergeTools(links: LinkToolConfig[]): ToolConfig[] {
  return toolCategories.flatMap((category) => [
    ...internalTools.filter((tool) => tool.category === category.id),
    ...links.filter((tool) => tool.category === category.id),
  ]);
}

function applyParsedCatalog(parsed: ParsedCatalog): void {
  linkTools.value = parsed.links;
  aiSites.value = parsed.aiSites;
  bookmarks.value = parsed.bookmarks;
}

function readCachedLinks(): void {
  if (!storageAvailable()) return;
  try {
    const cached = JSON.parse(localStorage.getItem(LINKS_CACHE_KEY) ?? 'null') as unknown;
    const parsed = parseCatalog(cached);
    if (parsed) applyParsedCatalog(parsed);
  } catch {
    // 缓存不可用时仅展示内置工具。
  }
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  readCachedLinks();
}

async function refreshLinks(): Promise<void> {
  initialize();
  if (loading) return loading;

  loading = (async () => {
    try {
      const response = await fetch(LINKS_CONFIG_URL, {
        cache: 'no-cache',
        credentials: 'same-origin',
      });
      if (!response.ok) return;

      const payload = loadYaml(await response.text()) as unknown;
      const parsed = parseCatalog(payload);
      if (!parsed) return;

      applyParsedCatalog(parsed);
      if (storageAvailable()) {
        try {
          localStorage.setItem(LINKS_CACHE_KEY, JSON.stringify(payload));
        } catch {
          // 缓存写入失败不影响当前页面使用最新配置。
        }
      }
    } catch {
      // 请求失败时保留缓存或仅展示内置工具。
    }
  })().finally(() => {
    loading = null;
  });

  return loading;
}

export function useToolCatalog() {
  initialize();
  const tools = computed(() => mergeTools(linkTools.value));

  return {
    tools,
    aiSites,
    bookmarks,
    refreshLinks,
  };
}
