import { computed, ref } from 'vue';
import bundledBackgroundVideos from 'virtual:tools-background-videos';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  fetchBackgroundVideoCatalog,
  getBackgroundVideoPath,
} from '@/features/tools/services/background-video-catalog';
import { pruneBackgroundVideoCache } from '@/features/tools/services/background-video-cache';

const STORAGE_KEY = `${STORAGE_POLICY.preferences}:tools-background`;
const DEFAULT_OPACITY = 0.3;
const DEFAULT_BLUR = 0;
const DEFAULT_SURFACE_OPACITY = 0.05;

type PersistedBackgroundState = {
  enabled?: boolean;
  videoUrl?: string | null;
  opacity?: number;
  blur?: number;
  surfaceOpacity?: number;
  randomShortcutEnabled?: boolean;
  applyToOtherPages?: boolean;
  applyToHome?: boolean;
};

const enabled = ref(false);
const videoUrl = ref<string | null>(null);
const opacity = ref(DEFAULT_OPACITY);
const blur = ref(DEFAULT_BLUR);
const surfaceOpacity = ref(DEFAULT_SURFACE_OPACITY);
const randomShortcutEnabled = ref(false);
const applyToOtherPages = ref(false);
const pendingVideoUrl = ref<string | null>(null);
const isLoading = ref(false);
const requestSequence = ref(0);
const errorMessage = ref('');
const settingsOpen = ref(false);
const availableVideos = ref<string[]>([...bundledBackgroundVideos]);
let initialized = false;
let catalogRefresh: Promise<void> | null = null;

const hasAvailableVideos = computed(() => availableVideos.value.length > 0);
const activeVideoUrl = computed(() => (enabled.value ? videoUrl.value : null));

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function persist(): void {
  if (!storageAvailable()) return;
  try {
    const state: PersistedBackgroundState = {
      enabled: enabled.value,
      videoUrl: videoUrl.value,
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

function reconcileActiveVideo(videos: string[]): void {
  const currentUrl = videoUrl.value;
  if (!enabled.value || !currentUrl) return;

  const currentPath = getBackgroundVideoPath(currentUrl);
  const currentVideo = videos.find(
    (candidate) => getBackgroundVideoPath(candidate) === currentPath,
  );
  if (currentVideo) {
    if (currentVideo !== currentUrl) {
      videoUrl.value = currentVideo;
      persist();
    }
    return;
  }

  cancelBackground();
}

async function refreshAvailableVideos(): Promise<void> {
  if (catalogRefresh) return catalogRefresh;

  catalogRefresh = (async () => {
    try {
      const videos = await fetchBackgroundVideoCatalog();
      availableVideos.value = videos;
      reconcileActiveVideo(videos);
      await pruneBackgroundVideoCache(videos);
    } catch {
      // 开发服务器不提供目录 JSON 时继续使用构建阶段生成的列表。
    } finally {
      catalogRefresh = null;
    }
  })();

  return catalogRefresh;
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
      typeof state.blur === 'number' && Number.isFinite(state.blur) ? state.blur : 0,
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

    const savedVideoUrl = typeof state.videoUrl === 'string' ? state.videoUrl : null;
    const savedVideoPath = savedVideoUrl ? getBackgroundVideoPath(savedVideoUrl) : null;
    if (
      state.enabled === true &&
      savedVideoUrl &&
      savedVideoPath &&
      /^\/data\/background\/[^/]+\.mp4$/i.test(savedVideoPath)
    ) {
      enabled.value = true;
      videoUrl.value = savedVideoUrl;
    }
  }

  void refreshAvailableVideos();
}

function openSettings(): void {
  settingsOpen.value = true;
  void refreshAvailableVideos();
}

function closeSettings(): void {
  settingsOpen.value = false;
}

function chooseRandomVideo(): string | null {
  const videos = availableVideos.value;
  if (!videos.length) return null;
  if (videos.length === 1) return videos[0] ?? null;

  const candidates = videos.filter((candidate) => candidate !== videoUrl.value);
  const pool = candidates.length ? candidates : videos;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? null;
}

function requestVideo(nextVideoUrl: string | null): void {
  if (!nextVideoUrl || !availableVideos.value.includes(nextVideoUrl)) return;
  errorMessage.value = '';
  pendingVideoUrl.value = nextVideoUrl;
}

async function requestRandomVideo(): Promise<void> {
  requestSequence.value += 1;
  await refreshAvailableVideos();
  requestVideo(chooseRandomVideo());
}

function commitVideo(nextVideoUrl: string): void {
  videoUrl.value = nextVideoUrl;
  enabled.value = true;
  pendingVideoUrl.value = null;
  isLoading.value = false;
  errorMessage.value = '';
  persist();
}

function rejectVideo(message = '视频加载失败，请稍后重试。'): void {
  pendingVideoUrl.value = null;
  isLoading.value = false;
  errorMessage.value = message;
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
  enabled.value = false;
  videoUrl.value = null;
  pendingVideoUrl.value = null;
  isLoading.value = false;
  errorMessage.value = '';
  persist();
}

export function useToolsBackground() {
  initialize();

  return {
    availableVideos,
    hasAvailableVideos,
    enabled,
    videoUrl,
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
    commitVideo,
    rejectVideo,
    setLoading,
    setOpacity,
    setBlur,
    setSurfaceOpacity,
    setRandomShortcutEnabled,
    setApplyToOtherPages,
    cancelBackground,
  };
}
