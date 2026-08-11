import { computed, shallowRef } from 'vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  toolCategories,
  toolCategoryMap,
  tools as internalTools,
  type LinkToolConfig,
  type ToolCategoryId,
  type ToolConfig,
  type ToolIconSource,
} from '@/features/tools/config/tools';

const LINKS_CONFIG_URL = '/tools-links.json';
const LINKS_CACHE_KEY = `${STORAGE_POLICY.preferences}:tools-links-cache`;
const TOOL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const linkTools = shallowRef<LinkToolConfig[]>([]);
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

function parseLinkTools(payload: unknown): LinkToolConfig[] | null {
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.links)) return null;

  const knownIds = new Set(internalTools.map((tool) => tool.id));
  const parsed: LinkToolConfig[] = [];

  for (const value of payload.links) {
    if (!isRecord(value)) continue;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const category = typeof value.category === 'string' ? value.category : '';
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    const url = typeof value.url === 'string' ? value.url.trim() : '';
    const icon = parseIcon(value.icon);

    if (
      !TOOL_ID_PATTERN.test(id) ||
      knownIds.has(id) ||
      !toolCategoryMap.has(category as ToolCategoryId) ||
      !name ||
      !description ||
      !url ||
      !isAllowedUrl(url) ||
      !icon
    ) {
      continue;
    }

    knownIds.add(id);
    parsed.push({
      type: 'link',
      id,
      category: category as ToolCategoryId,
      name,
      description,
      icon,
      url,
    });
  }

  return parsed;
}

function mergeTools(links: LinkToolConfig[]): ToolConfig[] {
  return toolCategories.flatMap((category) => [
    ...internalTools.filter((tool) => tool.category === category.id),
    ...links.filter((tool) => tool.category === category.id),
  ]);
}

function readCachedLinks(): void {
  if (!storageAvailable()) return;
  try {
    const cached = JSON.parse(localStorage.getItem(LINKS_CACHE_KEY) ?? 'null') as unknown;
    const parsed = parseLinkTools(cached);
    if (parsed) linkTools.value = parsed;
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

      const payload = (await response.json()) as unknown;
      const parsed = parseLinkTools(payload);
      if (!parsed) return;

      linkTools.value = parsed;
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
    refreshLinks,
  };
}
