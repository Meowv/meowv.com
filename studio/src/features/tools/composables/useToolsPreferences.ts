import { ref } from 'vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

const SEARCH_VISIBILITY_KEY = `${STORAGE_POLICY.preferences}:tools-search-visible`;

const searchVisible = ref(true);
let initialized = false;

function initialize(): void {
  if (initialized) return;
  initialized = true;
  if (!storageAvailable()) return;

  try {
    searchVisible.value = localStorage.getItem(SEARCH_VISIBILITY_KEY) !== 'false';
  } catch {
    searchVisible.value = true;
  }
}

function setSearchVisible(visible: boolean): void {
  searchVisible.value = visible;
  if (!storageAvailable()) return;

  try {
    if (visible) localStorage.removeItem(SEARCH_VISIBILITY_KEY);
    else localStorage.setItem(SEARCH_VISIBILITY_KEY, 'false');
  } catch {
    // 本地偏好不可用时仅保留当前页面状态。
  }
}

export function useToolsPreferences() {
  initialize();

  return {
    searchVisible,
    setSearchVisible,
  };
}
