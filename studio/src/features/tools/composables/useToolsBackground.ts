import { computed, ref } from 'vue';
import backgroundVideos from 'virtual:tools-background-videos';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

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
};

const enabled = ref(false);
const videoUrl = ref<string | null>(null);
const opacity = ref(DEFAULT_OPACITY);
const blur = ref(DEFAULT_BLUR);
const surfaceOpacity = ref(DEFAULT_SURFACE_OPACITY);
const randomShortcutEnabled = ref(false);
const pendingVideoUrl = ref<string | null>(null);
const isLoading = ref(false);
const errorMessage = ref('');
const settingsOpen = ref(false);
let initialized = false;

const availableVideos = computed(() => backgroundVideos);
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

function initialize(): void {
  if (initialized) return;
  initialized = true;

  const state = readPersistedState();
  if (!state) return;

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

  const savedVideoUrl = typeof state.videoUrl === 'string' ? state.videoUrl : null;
  if (state.enabled === true && savedVideoUrl && backgroundVideos.includes(savedVideoUrl)) {
    enabled.value = true;
    videoUrl.value = savedVideoUrl;
  } else if (state.enabled === true && savedVideoUrl) {
    // 持久化的视频已被删除，避免后续重复请求失效资源。
    enabled.value = false;
    videoUrl.value = null;
    persist();
  }
}

function openSettings(): void {
  settingsOpen.value = true;
}

function closeSettings(): void {
  settingsOpen.value = false;
}

function chooseRandomVideo(): string | null {
  if (!backgroundVideos.length) return null;
  if (backgroundVideos.length === 1) return backgroundVideos[0] ?? null;

  const candidates = backgroundVideos.filter((candidate) => candidate !== videoUrl.value);
  const pool = candidates.length ? candidates : backgroundVideos;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? null;
}

function requestVideo(nextVideoUrl: string | null): void {
  if (!nextVideoUrl || !backgroundVideos.includes(nextVideoUrl)) return;
  errorMessage.value = '';
  pendingVideoUrl.value = nextVideoUrl;
}

function requestRandomVideo(): void {
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
    isLoading,
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
    cancelBackground,
  };
}
