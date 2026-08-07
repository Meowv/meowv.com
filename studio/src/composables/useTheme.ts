import { computed, ref } from 'vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = `${STORAGE_POLICY.preferences}:theme`;
const preference = ref<ThemePreference>('system');
const systemTheme = ref<'light' | 'dark'>('light');
let initialized = false;
let mediaQuery: MediaQueryList | undefined;

const resolved = computed<'light' | 'dark'>(() =>
  preference.value === 'system' ? systemTheme.value : preference.value,
);

function readPreference(): ThemePreference {
  if (!storageAvailable()) return 'system';
  try {
    const value = localStorage.getItem(THEME_PREFERENCE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function handleSystemThemeChange(event: MediaQueryListEvent): void {
  systemTheme.value = event.matches ? 'dark' : 'light';
  if (preference.value === 'system') applyTheme(systemTheme.value);
}

export function initializeTheme(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  preference.value = readPreference();
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemTheme.value = mediaQuery.matches ? 'dark' : 'light';
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  applyTheme(resolved.value);
}

export function useTheme() {
  initializeTheme();

  function setPreference(value: ThemePreference): void {
    preference.value = value;
    applyTheme(resolved.value);

    if (!storageAvailable()) return;
    try {
      if (value === 'system') localStorage.removeItem(THEME_PREFERENCE_KEY);
      else localStorage.setItem(THEME_PREFERENCE_KEY, value);
    } catch {
      // 本地偏好不可用时，当前页面仍可正常切换。
    }
  }

  function toggle(): void {
    setPreference(resolved.value === 'dark' ? 'light' : 'dark');
  }

  function toggleWithoutPersist(): void {
    const next = resolved.value === 'dark' ? 'light' : 'dark';
    preference.value = next;
    applyTheme(next);
  }

  return { preference, resolved, setPreference, toggle, toggleWithoutPersist };
}
