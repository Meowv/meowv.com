import { computed, ref } from 'vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { WallpaperRepository } from '@/features/wallpapers/services/wallpaperRepository';
import type { WallpaperItem } from '@/features/wallpapers/types';

const STORAGE_KEY = `${STORAGE_POLICY.preferences}:tools-background`;
const LEGACY_BACKGROUND_VIDEO_CACHE = 'meowv-tools-background-v1';
const PERSISTED_SCHEMA_VERSION = 2;
const DEFAULT_OPACITY = 0.3;
const DEFAULT_BLUR = 0;
const DEFAULT_SURFACE_OPACITY = 0.05;

export type ToolsBackgroundSource = {
  kind: 'wallpaper';
  wallpaperId: number;
  title: string | null;
  videoUrl: string;
};

type PersistedBackgroundState = {
  schemaVersion?: number;
  enabled?: boolean;
  source?: unknown;
  videoUrl?: string | null;
  opacity?: number;
  blur?: number;
  surfaceOpacity?: number;
  randomShortcutEnabled?: boolean;
  applyToOtherPages?: boolean;
  applyToHome?: boolean;
};

type PendingResult = {
  key: string;
  resolve: (success: boolean) => void;
};

const enabled = ref(false);
const activeSource = ref<ToolsBackgroundSource | null>(null);
const pendingSource = ref<ToolsBackgroundSource | null>(null);
const opacity = ref(DEFAULT_OPACITY);
const blur = ref(DEFAULT_BLUR);
const surfaceOpacity = ref(DEFAULT_SURFACE_OPACITY);
const randomShortcutEnabled = ref(false);
const applyToOtherPages = ref(false);
const isLoading = ref(false);
const requestSequence = ref(0);
const errorMessage = ref('');
const settingsOpen = ref(false);
let initialized = false;
let legacyCacheCleanupStarted = false;
let wallpaperRepository: WallpaperRepository | null = null;
let pendingResult: PendingResult | null = null;

const activeVideoUrl = computed(() =>
  enabled.value ? (activeSource.value?.videoUrl ?? null) : null,
);
const pendingVideoUrl = computed(() => pendingSource.value?.videoUrl ?? null);
const activeWallpaperId = computed(() =>
  enabled.value ? (activeSource.value?.wallpaperId ?? null) : null,
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sourceKey(source: ToolsBackgroundSource): string {
  return `${source.wallpaperId}:${source.videoUrl}`;
}

function isAllowedVideoUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.shanhutech.cn');
  } catch {
    return false;
  }
}

function parseSource(value: unknown): ToolsBackgroundSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<ToolsBackgroundSource>;
  if (
    source.kind !== 'wallpaper' ||
    !Number.isInteger(source.wallpaperId) ||
    Number(source.wallpaperId) <= 0 ||
    !isAllowedVideoUrl(source.videoUrl)
  ) {
    return null;
  }
  return {
    kind: 'wallpaper',
    wallpaperId: Number(source.wallpaperId),
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : null,
    videoUrl: source.videoUrl,
  };
}

function sourceFromWallpaper(item: WallpaperItem): ToolsBackgroundSource | null {
  if (
    item.deviceType !== 'desktop' ||
    item.contentType !== 'dynamic' ||
    !Number.isInteger(item.id) ||
    item.id <= 0 ||
    !isAllowedVideoUrl(item.previewVideoUrl)
  ) {
    return null;
  }
  return {
    kind: 'wallpaper',
    wallpaperId: item.id,
    title: item.title?.trim() || null,
    videoUrl: item.previewVideoUrl,
  };
}

function persist(): void {
  if (!storageAvailable()) return;
  try {
    const state: PersistedBackgroundState = {
      schemaVersion: PERSISTED_SCHEMA_VERSION,
      enabled: enabled.value,
      source: enabled.value ? activeSource.value : null,
      opacity: opacity.value,
      blur: blur.value,
      surfaceOpacity: surfaceOpacity.value,
      randomShortcutEnabled: randomShortcutEnabled.value,
      applyToOtherPages: applyToOtherPages.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 本地偏好不可用时仅保留当前页面状态。
  }
}

function readPersistedState(): PersistedBackgroundState | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PersistedBackgroundState) : null;
  } catch {
    return null;
  }
}

function cleanupLegacyVideoCache(): void {
  if (legacyCacheCleanupStarted) return;
  legacyCacheCleanupStarted = true;
  if ('caches' in window) {
    void caches.delete(LEGACY_BACKGROUND_VIDEO_CACHE).catch(() => undefined);
  }
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  const state = readPersistedState();
  if (state) {
    opacity.value = clamp(
      typeof state.opacity === 'number' && Number.isFinite(state.opacity)
        ? state.opacity
        : DEFAULT_OPACITY,
      0,
      1,
    );
    blur.value = clamp(
      typeof state.blur === 'number' && Number.isFinite(state.blur) ? state.blur : DEFAULT_BLUR,
      0,
      24,
    );
    surfaceOpacity.value = clamp(
      typeof state.surfaceOpacity === 'number' && Number.isFinite(state.surfaceOpacity)
        ? state.surfaceOpacity
        : DEFAULT_SURFACE_OPACITY,
      0,
      1,
    );
    randomShortcutEnabled.value = state.randomShortcutEnabled === true;
    applyToOtherPages.value = state.applyToOtherPages === true || state.applyToHome === true;

    const savedSource =
      state.schemaVersion === PERSISTED_SCHEMA_VERSION ? parseSource(state.source) : null;
    if (state.enabled === true && savedSource) {
      enabled.value = true;
      activeSource.value = savedSource;
    }

    if (
      state.schemaVersion !== PERSISTED_SCHEMA_VERSION ||
      Object.prototype.hasOwnProperty.call(state, 'videoUrl') ||
      (state.enabled === true && !savedSource)
    ) {
      persist();
    }
  }

  cleanupLegacyVideoCache();
}

function openSettings(): void {
  settingsOpen.value = true;
}

function closeSettings(): void {
  settingsOpen.value = false;
}

function finishPendingResult(success: boolean): void {
  const result = pendingResult;
  pendingResult = null;
  result?.resolve(success);
}

function beginSourceRequest(source: ToolsBackgroundSource, sequence: number): Promise<boolean> {
  if (sequence !== requestSequence.value) return Promise.resolve(false);
  if (enabled.value && activeSource.value && sourceKey(activeSource.value) === sourceKey(source)) {
    pendingSource.value = null;
    isLoading.value = false;
    errorMessage.value = '';
    return Promise.resolve(true);
  }

  finishPendingResult(false);
  errorMessage.value = '';
  pendingSource.value = source;
  isLoading.value = true;
  return new Promise<boolean>((resolve) => {
    pendingResult = { key: sourceKey(source), resolve };
  });
}

async function requestRandomVideo(): Promise<boolean> {
  const sequence = ++requestSequence.value;
  finishPendingResult(false);
  pendingSource.value = null;
  errorMessage.value = '';
  isLoading.value = true;

  try {
    wallpaperRepository ??= new WallpaperRepository();
    const item = await wallpaperRepository.randomBackground(activeSource.value?.wallpaperId);
    if (sequence !== requestSequence.value) return false;
    if (!item) {
      isLoading.value = false;
      errorMessage.value = '暂未发现可用的动态壁纸。';
      return false;
    }
    const source = sourceFromWallpaper(item);
    if (!source) {
      isLoading.value = false;
      errorMessage.value = '随机壁纸的视频地址无效。';
      return false;
    }
    return await beginSourceRequest(source, sequence);
  } catch (error) {
    if (sequence !== requestSequence.value) return false;
    isLoading.value = false;
    errorMessage.value = error instanceof Error ? error.message : '随机壁纸加载失败。';
    return false;
  }
}

function requestWallpaperBackground(item: WallpaperItem): Promise<boolean> {
  const source = sourceFromWallpaper(item);
  const sequence = ++requestSequence.value;
  if (!source) {
    isLoading.value = false;
    errorMessage.value = '仅支持将电脑动态壁纸设为视频背景。';
    return Promise.resolve(false);
  }
  return beginSourceRequest(source, sequence);
}

function commitBackground(source: ToolsBackgroundSource): void {
  const key = sourceKey(source);
  if (!pendingSource.value || sourceKey(pendingSource.value) !== key) return;
  activeSource.value = source;
  enabled.value = true;
  pendingSource.value = null;
  isLoading.value = false;
  errorMessage.value = '';
  persist();
  if (pendingResult?.key === key) finishPendingResult(true);
}

function rejectBackground(
  message = '视频加载失败，请稍后重试。',
  source?: ToolsBackgroundSource,
): void {
  if (source && pendingSource.value && sourceKey(pendingSource.value) !== sourceKey(source)) return;
  const rejectedKey = pendingSource.value ? sourceKey(pendingSource.value) : null;
  pendingSource.value = null;
  isLoading.value = false;
  errorMessage.value = message;
  if (!source || !rejectedKey || pendingResult?.key === rejectedKey) finishPendingResult(false);
}

function setLoading(loading: boolean): void {
  isLoading.value = loading;
}

function setOpacity(value: number): void {
  opacity.value = clamp(value, 0, 1);
  persist();
}

function setBlur(value: number): void {
  blur.value = clamp(value, 0, 24);
  persist();
}

function setSurfaceOpacity(value: number): void {
  surfaceOpacity.value = clamp(value, 0, 1);
  persist();
}

function setRandomShortcutEnabled(value: boolean): void {
  randomShortcutEnabled.value = value;
  persist();
}

function setApplyToOtherPages(value: boolean): void {
  applyToOtherPages.value = value;
  persist();
}

function cancelBackground(): void {
  requestSequence.value += 1;
  finishPendingResult(false);
  enabled.value = false;
  activeSource.value = null;
  pendingSource.value = null;
  isLoading.value = false;
  errorMessage.value = '';
  persist();
}

export function useToolsBackground() {
  initialize();

  return {
    enabled,
    activeSource,
    pendingSource,
    activeWallpaperId,
    activeVideoUrl,
    pendingVideoUrl,
    opacity,
    blur,
    surfaceOpacity,
    randomShortcutEnabled,
    applyToOtherPages,
    isLoading,
    requestSequence,
    errorMessage,
    settingsOpen,
    openSettings,
    closeSettings,
    requestRandomVideo,
    requestWallpaperBackground,
    commitBackground,
    rejectBackground,
    setLoading,
    setOpacity,
    setBlur,
    setSurfaceOpacity,
    setRandomShortcutEnabled,
    setApplyToOtherPages,
    cancelBackground,
  };
}
