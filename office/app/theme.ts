export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'ran-theme';
const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
let stopSystemListener: (() => void) | undefined;

function getStoredMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function applyResolvedTheme(isDark: boolean): void {
  document.documentElement.setAttribute('data-ran-theme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('theme', isDark ? 'dark' : 'light');
}

export function applyTheme(mode: ThemeMode): ThemeMode {
  stopSystemListener?.();
  stopSystemListener = undefined;

  if (mode === 'system') {
    const syncSystemTheme = () => applyResolvedTheme(Boolean(systemTheme?.matches));
    syncSystemTheme();
    systemTheme?.addEventListener('change', syncSystemTheme);
    stopSystemListener = () => systemTheme?.removeEventListener('change', syncSystemTheme);
  } else {
    applyResolvedTheme(mode === 'dark');
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // 主题偏好无法写入时仍在当前页面生效。
  }
  document.dispatchEvent(new CustomEvent('office:theme-changed', { detail: mode }));
  return mode;
}

export function getThemeMode(): ThemeMode {
  return getStoredMode();
}

export function cycleTheme(): ThemeMode {
  const current = getStoredMode();
  return applyTheme(current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system');
}

export function initializeTheme(): void {
  applyTheme(getStoredMode());
}
