import { readonly, ref } from 'vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

const FAVORITES_KEY = `${STORAGE_POLICY.preferences}:tools-favorites`;
const favoriteIds = ref<string[]>([]);
let initialized = false;

function initialize(): void {
  if (initialized) return;
  initialized = true;
  if (!storageAvailable()) return;

  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as unknown;
    favoriteIds.value = Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    favoriteIds.value = [];
  }
}

function isFavorite(toolId: string): boolean {
  return favoriteIds.value.includes(toolId);
}

function toggleFavorite(toolId: string): void {
  favoriteIds.value = isFavorite(toolId)
    ? favoriteIds.value.filter((id) => id !== toolId)
    : [...favoriteIds.value, toolId];

  if (!storageAvailable()) return;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value));
  } catch {
    // 本地偏好不可用时仍保留当前页面状态。
  }
}

export function useToolFavorites() {
  initialize();
  return {
    favoriteIds: readonly(favoriteIds),
    isFavorite,
    toggleFavorite,
  };
}
