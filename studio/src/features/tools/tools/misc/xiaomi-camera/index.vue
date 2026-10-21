<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type Hls from 'hls.js';
import type { ErrorData, Events } from 'hls.js';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCamera,
  IconPlayerPlay,
  IconRefresh,
  IconSettings,
  IconVolume,
  IconVolumeOff,
  IconX,
} from '@tabler/icons-vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';

type CameraDevice = {
  deviceFingerprint: string;
  model: string;
  displayName: string;
  isOnline: boolean;
};

type CameraConnection = {
  serviceUrl: string;
  accessCode: string;
};

type PlaybackSession = {
  playlistUrl: string;
  status: 'preparing' | 'ready' | 'failed' | 'stopped';
  statusUrl?: string;
  audioAvailable?: boolean;
};

type PlaybackSessionPayload = {
  playlistUrl?: unknown;
  hlsUrl?: unknown;
  status?: unknown;
  statusUrl?: unknown;
  audioAvailable?: unknown;
};

class CameraServiceError extends Error {
  constructor(
    message: string,
    readonly authorizationFailed = false,
  ) {
    super(message);
  }
}

class PlaybackTicketExpiredError extends Error {}

class PlaybackFrameTimeoutError extends Error {}

const SERVICE_URL_KEY = `${STORAGE_POLICY.preferences}:xiaomi-camera-service-url`;
const ACCESS_CODE_KEY = `${STORAGE_POLICY.preferences}:xiaomi-camera-access-code`;
const DEFAULT_SERVICE_URL = 'https://studio.meowv.com';

const cameras = ref<CameraDevice[]>([]);
const selectedFingerprint = ref<string>();
const connection = ref<CameraConnection>();
const draftServiceUrl = ref(readStoredValue(SERVICE_URL_KEY) || DEFAULT_SERVICE_URL);
const draftAccessCode = ref(readStoredValue(ACCESS_CODE_KEY));
const rememberAccessCode = ref(Boolean(draftAccessCode.value));
const connectionDialogOpen = ref(false);
const connectionError = ref('');
const playbackError = ref('');
const preparationMessage = ref('');
const loadingDevices = ref(false);
const savingConnection = ref(false);
const starting = ref(false);
const hasPlaybackSource = ref(false);
const playbackReady = ref(false);
const motorBusy = ref(false);
const motorMessage = ref('');
const audioEnabled = ref(false);
const audioAvailable = ref(false);
const video = ref<HTMLVideoElement>();
const closeConnectionButton = ref<HTMLButtonElement>();
const accessCodeInput = ref<HTMLInputElement>();
const dialogSelectedFingerprint = ref<string>();

let deviceController: AbortController | undefined;
let hls: Hls | undefined;
let playbackAbort: AbortController | undefined;
let recoveryAttempted = false;
let recoveryPromise: Promise<void> | undefined;
let lastRecoveryAt = 0;
let stabilityTimer: number | undefined;
let stallTimer: number | undefined;
let stallSeekAttempted = false;
let playbackMonitor: number | undefined;
let lastObservedPlaybackTime = 0;
let lastPlaybackProgressAt = 0;
let lastActiveElement: HTMLElement | null = null;
let dialogOriginalServiceUrl = draftServiceUrl.value;
let lastMotorStepAt = 0;

const selectedCamera = computed(() =>
  cameras.value.find((camera) => camera.deviceFingerprint === selectedFingerprint.value),
);
const hasConnection = computed(() => Boolean(connection.value));
const viewerMessage = computed(() => {
  if (connectionError.value) return connectionError.value;
  if (playbackError.value) return playbackError.value;
  if (starting.value) return preparationMessage.value || '正在准备视频流…';
  if (loadingDevices.value) return '正在读取设备…';
  if (!hasConnection.value) return '连接摄像头服务以开始预览';
  if (!cameras.value.length) return '服务中没有可用的摄像头';
  if (!selectedCamera.value?.isOnline) return '请选择一台在线摄像头';
  return '';
});
const viewerActionLabel = computed(() =>
  hasConnection.value && !connectionError.value ? '开始预览' : '配置服务',
);

function readStoredValue(key: string): string {
  if (!storageAvailable()) return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveStoredValue(key: string, value: string): void {
  if (!storageAvailable()) return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // 浏览器拒绝本机存储时，当前会话仍可继续使用。
  }
}

function normalizeServiceUrl(value: string): string {
  const source = value.trim();
  if (!source) throw new CameraServiceError('请输入服务地址。');

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new CameraServiceError('服务地址格式无效。');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new CameraServiceError('请输入不带查询参数的 HTTP(S) 服务地址。');
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (url.protocol !== 'https:' && !loopbackHosts.has(url.hostname)) {
    throw new CameraServiceError('非本机服务必须使用 HTTPS。');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function serviceApiUrl(serviceUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ''), `${serviceUrl}/`).toString();
}

async function authorizedRequest(
  activeConnection: CameraConnection,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(serviceApiUrl(activeConnection.serviceUrl, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${activeConnection.accessCode}`,
        ...init.headers,
      },
    });
  } catch {
    throw new CameraServiceError('无法连接摄像头服务。');
  }

  if (response.status === 401 || response.status === 403) {
    throw new CameraServiceError('授权码无效或已失效，请重新配置服务。', true);
  }
  if (response.status === 409) {
    const payload = (await response.json().catch(() => undefined)) as
      { code?: unknown } | undefined;
    if (payload?.code === 'xiaomi_session_expired') {
      throw new CameraServiceError('小米登录会话已失效，请在服务初始化页重新登录。');
    }
    if (payload?.code === 'camera_session_unavailable') {
      throw new CameraServiceError('预览会话已结束，请重新开始预览。');
    }
  }
  if (response.status === 429) {
    const payload = (await response.json().catch(() => undefined)) as
      { code?: unknown } | undefined;
    if (payload?.code === 'camera_capacity_exceeded') {
      throw new CameraServiceError('同时播放的设备已达上限。');
    }
    throw new CameraServiceError('操作过于频繁，请稍后再试。');
  }
  if (!response.ok) {
    throw new CameraServiceError('摄像头服务暂时无法处理请求。');
  }
  return response;
}

function isCameraDevice(value: unknown): value is CameraDevice {
  if (!value || typeof value !== 'object') return false;
  const device = value as Partial<CameraDevice>;
  return (
    typeof device.deviceFingerprint === 'string' &&
    typeof device.model === 'string' &&
    typeof device.displayName === 'string' &&
    typeof device.isOnline === 'boolean'
  );
}

async function fetchCameras(
  activeConnection: CameraConnection,
  signal?: AbortSignal,
): Promise<CameraDevice[]> {
  const response = await authorizedRequest(activeConnection, '/api/xiaomi-camera/cameras', {
    signal,
  });
  const payload: unknown = await response.json();
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? (payload as { cameras?: unknown }).cameras
      : undefined;
  if (!Array.isArray(source)) {
    throw new CameraServiceError('摄像头服务返回了无效的设备列表。');
  }
  return source.filter(isCameraDevice);
}

async function createPlaybackSession(
  activeConnection: CameraConnection,
  fingerprint: string,
  signal: AbortSignal,
): Promise<PlaybackSession> {
  const response = await authorizedRequest(
    activeConnection,
    '/api/xiaomi-camera/playback-sessions',
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceFingerprint: fingerprint }),
    },
  );
  const payload = (await response.json()) as PlaybackSessionPayload;
  const playlistUrl = payload.playlistUrl ?? payload.hlsUrl;
  if (typeof playlistUrl !== 'string' || !playlistUrl) {
    throw new CameraServiceError('摄像头服务未返回播放地址。');
  }

  let resolvedPlaylistUrl: string;
  try {
    resolvedPlaylistUrl = new URL(playlistUrl, `${activeConnection.serviceUrl}/`).toString();
  } catch {
    throw new CameraServiceError('摄像头服务返回了无效的播放地址。');
  }

  if (typeof payload.statusUrl !== 'string' || !payload.statusUrl) {
    // 兼容尚未升级的服务端：旧接口只有清单地址，由 HLS 请求自行等待首片。
    return {
      playlistUrl: resolvedPlaylistUrl,
      status: 'ready',
      audioAvailable: payload.audioAvailable === true,
    };
  }

  if (!['preparing', 'ready', 'failed', 'stopped'].includes(String(payload.status))) {
    throw new CameraServiceError('摄像头服务返回了无效的播放准备状态。');
  }
  try {
    return {
      playlistUrl: resolvedPlaylistUrl,
      status: payload.status as PlaybackSession['status'],
      statusUrl: new URL(payload.statusUrl, `${activeConnection.serviceUrl}/`).toString(),
      audioAvailable: payload.audioAvailable === true,
    };
  } catch {
    throw new CameraServiceError('摄像头服务返回了无效的播放状态地址。');
  }
}

function waitForPlaybackPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: number | undefined;
    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      reject(new DOMException('播放已停止。', 'AbortError'));
    };
    if (signal.aborted) {
      cancel();
      return;
    }
    timer = window.setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 1000);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function waitForPlaybackReady(
  session: PlaybackSession,
  signal: AbortSignal,
): Promise<boolean> {
  if (!session.statusUrl || session.status === 'ready') return session.audioAvailable === true;
  const deadline = Date.now() + 95_000;
  preparationMessage.value = '正在连接摄像头并准备首段视频…';

  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException('播放已停止。', 'AbortError');
    await waitForPlaybackPoll(signal);
    let response: Response;
    try {
      // 状态端点以短期票据授权，不把长期授权码放入清单或媒体请求。
      response = await fetch(session.statusUrl, {
        headers: { Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new CameraServiceError('查询视频准备状态失败，请检查服务连接后重试。');
    }

    if (response.status === 404 || response.status === 410) {
      throw new PlaybackTicketExpiredError();
    }
    if (!response.ok) {
      throw new CameraServiceError('摄像头服务无法返回视频准备状态。');
    }

    const payload = (await response.json().catch(() => undefined)) as
      { status?: unknown; error?: unknown; audioAvailable?: unknown } | undefined;
    if (payload?.status === 'ready') return payload.audioAvailable === true;
    if (payload?.status === 'failed') {
      throw new CameraServiceError(
        typeof payload.error === 'string' && payload.error
          ? payload.error
          : '视频流准备失败，请检查服务端日志。',
      );
    }
    if (payload?.status === 'stopped') {
      throw new CameraServiceError('视频准备已停止，请重新开始预览。');
    }
    if (payload?.status !== 'preparing') {
      throw new CameraServiceError('摄像头服务返回了未知的视频准备状态。');
    }
  }

  throw new CameraServiceError('等待视频流准备超过 90 秒，请查看服务端诊断日志后重试。');
}

async function waitForVideoFrame(player: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && player.videoWidth > 0) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeout: number | undefined;
    let frameCallback: number | undefined;

    const cleanup = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (frameCallback !== undefined && player.cancelVideoFrameCallback) {
        player.cancelVideoFrameCallback(frameCallback);
      }
      player.removeEventListener('loadeddata', checkReady);
      player.removeEventListener('playing', checkReady);
      signal.removeEventListener('abort', abort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const checkReady = () => {
      if (player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && player.videoWidth > 0)
        finish();
    };
    const abort = () => finish(new DOMException('播放已停止。', 'AbortError'));

    timeout = window.setTimeout(
      () => finish(new PlaybackFrameTimeoutError('视频流已就绪，但 15 秒内没有解码出画面。')),
      15_000,
    );
    player.addEventListener('loadeddata', checkReady);
    player.addEventListener('playing', checkReady);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }

    if (player.requestVideoFrameCallback) {
      frameCallback = player.requestVideoFrameCallback(() => {
        frameCallback = undefined;
        if (player.videoWidth > 0) finish();
        else if (!settled) frameCallback = player.requestVideoFrameCallback(checkFrame);
      });
    }

    function checkFrame(): void {
      frameCallback = undefined;
      if (player.videoWidth > 0) finish();
      else if (!settled && player.requestVideoFrameCallback) {
        frameCallback = player.requestVideoFrameCallback(checkFrame);
      }
    }

    checkReady();
  });
}

function selectInitialCamera(devices: CameraDevice[], preferredFingerprint?: string): void {
  const preferred = preferredFingerprint ?? selectedFingerprint.value;
  selectedFingerprint.value = devices.some((camera) => camera.deviceFingerprint === preferred)
    ? preferred
    : devices[0]?.deviceFingerprint;
}

function clearAuthorization(): void {
  saveStoredValue(ACCESS_CODE_KEY, '');
  draftAccessCode.value = '';
  rememberAccessCode.value = false;
}

function invalidateConnection(message: string): void {
  stopPlayback();
  connection.value = undefined;
  cameras.value = [];
  selectedFingerprint.value = undefined;
  connectionError.value = message;
  clearAuthorization();
  openConnectionDialog();
}

async function refreshDevices(): Promise<void> {
  const activeConnection = connection.value;
  if (!activeConnection) {
    openConnectionDialog();
    return;
  }

  deviceController?.abort();
  const controller = new AbortController();
  deviceController = controller;
  loadingDevices.value = true;
  connectionError.value = '';
  try {
    const devices = await fetchCameras(activeConnection, controller.signal);
    if (controller.signal.aborted) return;
    stopPlayback();
    cameras.value = devices;
    selectInitialCamera(devices);
    dialogSelectedFingerprint.value = selectedFingerprint.value;
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof CameraServiceError && error.authorizationFailed) {
      invalidateConnection(error.message);
      return;
    }
    connectionError.value = error instanceof Error ? error.message : '无法读取摄像头设备列表。';
  } finally {
    if (deviceController === controller) loadingDevices.value = false;
  }
}

function openConnectionDialog(): void {
  dialogOriginalServiceUrl = draftServiceUrl.value;
  dialogSelectedFingerprint.value = selectedFingerprint.value;
  connectionDialogOpen.value = true;
}

function closeConnectionDialog(): void {
  connectionDialogOpen.value = false;
}

function handleServiceUrlInput(): void {
  if (draftServiceUrl.value === dialogOriginalServiceUrl) return;
  clearAuthorization();
  if (!connection.value) return;
  stopPlayback();
  connection.value = undefined;
  cameras.value = [];
  selectedFingerprint.value = undefined;
}

async function submitConnection(): Promise<void> {
  let serviceUrl: string;
  try {
    serviceUrl = normalizeServiceUrl(draftServiceUrl.value);
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : '服务地址无效。';
    return;
  }

  const accessCode = draftAccessCode.value.trim();
  if (!accessCode) {
    connectionError.value = '请输入授权码。';
    await nextTick();
    accessCodeInput.value?.focus();
    return;
  }

  savingConnection.value = true;
  connectionError.value = '';
  try {
    const nextConnection = { serviceUrl, accessCode };
    const devices = await fetchCameras(nextConnection);
    stopPlayback();
    connection.value = nextConnection;
    cameras.value = devices;
    selectedFingerprint.value = undefined;
    selectInitialCamera(devices, dialogSelectedFingerprint.value);
    dialogSelectedFingerprint.value = selectedFingerprint.value;
    draftServiceUrl.value = serviceUrl;
    dialogOriginalServiceUrl = serviceUrl;
    saveStoredValue(SERVICE_URL_KEY, serviceUrl);
    saveStoredValue(ACCESS_CODE_KEY, rememberAccessCode.value ? accessCode : '');
    connectionDialogOpen.value = false;
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : '无法验证摄像头服务配置。';
  } finally {
    savingConnection.value = false;
  }
}

function forgetAuthorization(): void {
  stopPlayback();
  connection.value = undefined;
  cameras.value = [];
  selectedFingerprint.value = undefined;
  connectionError.value = '授权码已清除，请重新配置服务。';
  clearAuthorization();
  openConnectionDialog();
}

function detachPlayback(): void {
  playbackReady.value = false;
  motorMessage.value = '';
  audioEnabled.value = false;
  audioAvailable.value = false;
  if (stabilityTimer !== undefined) {
    window.clearTimeout(stabilityTimer);
    stabilityTimer = undefined;
  }
  if (stallTimer !== undefined) {
    window.clearTimeout(stallTimer);
    stallTimer = undefined;
  }
  if (playbackMonitor !== undefined) {
    window.clearInterval(playbackMonitor);
    playbackMonitor = undefined;
  }
  stallSeekAttempted = false;
  playbackAbort?.abort();
  playbackAbort = undefined;
  hls?.destroy();
  hls = undefined;
  hasPlaybackSource.value = false;
  if (video.value) {
    video.value.muted = true;
    video.value.pause();
    video.value.removeAttribute('src');
    video.value.load();
  }
}

function toggleAudio(): void {
  if (!playbackReady.value || !audioAvailable.value || !video.value) return;
  audioEnabled.value = !audioEnabled.value;
  video.value.muted = !audioEnabled.value;
}

function handleVideoVolumeChange(): void {
  audioEnabled.value = Boolean(video.value && !video.value.muted && video.value.volume > 0);
}

function stopPlayback(): void {
  recoveryAttempted = false;
  recoveryPromise = undefined;
  lastRecoveryAt = 0;
  starting.value = false;
  playbackError.value = '';
  preparationMessage.value = '';
  detachPlayback();
}

function reportPlaybackFailure(message: string): void {
  detachPlayback();
  starting.value = false;
  playbackError.value = message;
}

async function requestPlaybackRecovery(): Promise<void> {
  // video.error 与 hls.js fatal error 可能描述同一次中断；合并并发信号，避免互相销毁恢复中的播放器。
  if (recoveryPromise) {
    await recoveryPromise;
    return;
  }
  if (recoveryAttempted) {
    if (Date.now() - lastRecoveryAt < 3000) return;
    reportPlaybackFailure('视频流已中断，请重新开始预览。');
    return;
  }
  recoveryAttempted = true;
  lastRecoveryAt = Date.now();
  const recovery = startPlayback(true);
  recoveryPromise = recovery;
  try {
    await recovery;
  } finally {
    if (recoveryPromise === recovery) recoveryPromise = undefined;
  }
}

function handleVideoPlaying(): void {
  if (stallTimer !== undefined) {
    window.clearTimeout(stallTimer);
    stallTimer = undefined;
  }
  if (stabilityTimer !== undefined) window.clearTimeout(stabilityTimer);
  lastObservedPlaybackTime = video.value?.currentTime ?? 0;
  lastPlaybackProgressAt = performance.now();
  const activePlayback = playbackAbort;
  if (!activePlayback) return;
  stabilityTimer = window.setTimeout(() => {
    stabilityTimer = undefined;
    if (playbackAbort === activePlayback && video.value && !video.value.paused) {
      recoveryAttempted = false;
      lastRecoveryAt = 0;
      stallSeekAttempted = false;
    }
  }, 60_000);
}

function handleVideoWaiting(): void {
  if (stabilityTimer !== undefined) {
    window.clearTimeout(stabilityTimer);
    stabilityTimer = undefined;
  }
  const activePlayback = playbackAbort;
  if (
    !playbackReady.value ||
    !activePlayback ||
    !video.value ||
    video.value.paused ||
    stallTimer !== undefined
  )
    return;
  stallTimer = window.setTimeout(() => {
    stallTimer = undefined;
    const player = video.value;
    if (playbackAbort !== activePlayback || !playbackReady.value || !player || player.paused)
      return;

    const syncPosition = hls?.liveSyncPosition;
    const seekableEnd = player.seekable.length
      ? player.seekable.end(player.seekable.length - 1)
      : undefined;
    const target =
      syncPosition !== null && syncPosition !== undefined && seekableEnd !== undefined
        ? Math.min(syncPosition, seekableEnd)
        : undefined;
    if (!stallSeekAttempted && target !== undefined && target > player.currentTime + 3) {
      stallSeekAttempted = true;
      player.currentTime = target;
      handleVideoWaiting();
      return;
    }

    void requestPlaybackRecovery();
  }, 8_000);
}

function monitorPlayback(player: HTMLVideoElement, activePlayback: AbortController): void {
  lastObservedPlaybackTime = player.currentTime;
  lastPlaybackProgressAt = performance.now();
  playbackMonitor = window.setInterval(() => {
    if (playbackAbort !== activePlayback || !playbackReady.value) return;
    if (player.paused || document.hidden) {
      lastObservedPlaybackTime = player.currentTime;
      lastPlaybackProgressAt = performance.now();
      return;
    }
    if (
      player.currentTime > lastObservedPlaybackTime + 0.2 ||
      player.currentTime < lastObservedPlaybackTime - 0.5
    ) {
      lastObservedPlaybackTime = player.currentTime;
      lastPlaybackProgressAt = performance.now();
      return;
    }
    if (performance.now() - lastPlaybackProgressAt >= 6_000) handleVideoWaiting();
  }, 2_000);
}

async function attachHls(
  player: HTMLVideoElement,
  source: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new DOMException('播放已停止。', 'AbortError');
  if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = source;
    return;
  }

  const { default: HlsPlayer } = await import('hls.js');
  if (signal.aborted) throw new DOMException('播放已停止。', 'AbortError');
  if (!HlsPlayer.isSupported()) {
    throw new CameraServiceError('当前浏览器不支持 HLS 播放。');
  }

  const instance = new HlsPlayer({
    enableWorker: true,
    lowLatencyMode: false,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 6,
    maxBufferLength: 10,
    maxMaxBufferLength: 20,
    backBufferLength: 15,
  });
  hls = instance;
  await new Promise<void>((resolve, reject) => {
    let manifestParsed = false;
    let fatalRetries = 0;
    const timeout = window.setTimeout(
      () => reject(new CameraServiceError('HLS 播放列表已返回，但播放器 15 秒内未能解析。')),
      15_000,
    );
    const cancel = () => {
      window.clearTimeout(timeout);
      reject(new DOMException('播放已停止。', 'AbortError'));
    };
    const manifestReady = () => {
      manifestParsed = true;
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const handleError = (_event: Events.ERROR, data: ErrorData) => {
      if (!data.fatal || instance !== hls) return;
      const responseCode = data.response?.code;
      if (manifestParsed) {
        queueMicrotask(() => {
          if (instance === hls && !signal.aborted) void requestPlaybackRecovery();
        });
        return;
      }
      if (responseCode === 410) {
        window.clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        reject(new PlaybackTicketExpiredError());
        return;
      }
      if (fatalRetries++ === 0 && data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
        instance.recoverMediaError();
        return;
      }
      if (fatalRetries === 1 && data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
        instance.startLoad();
        return;
      }
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      reject(new CameraServiceError('HLS 播放器无法初始化。'));
    };

    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    instance.once(HlsPlayer.Events.MANIFEST_PARSED, manifestReady);
    instance.on(HlsPlayer.Events.ERROR, handleError);
    instance.loadSource(source);
    instance.attachMedia(player);
  });
}

async function startPlayback(isRecovery = false): Promise<void> {
  const activeConnection = connection.value;
  const camera = selectedCamera.value;
  const player = video.value;
  if (!activeConnection) {
    openConnectionDialog();
    return;
  }
  if (!camera?.isOnline || !player) return;

  if (!isRecovery) {
    recoveryAttempted = false;
    lastRecoveryAt = 0;
  }
  detachPlayback();
  starting.value = true;
  preparationMessage.value = '正在创建播放会话…';
  playbackError.value = '';
  hasPlaybackSource.value = true;
  const attempt = new AbortController();
  playbackAbort = attempt;
  try {
    const session = await createPlaybackSession(
      activeConnection,
      camera.deviceFingerprint,
      attempt.signal,
    );
    if (attempt.signal.aborted) return;
    audioAvailable.value = await waitForPlaybackReady(session, attempt.signal);
    if (attempt.signal.aborted) return;
    preparationMessage.value = '视频已就绪，正在启动播放器…';
    await attachHls(player, session.playlistUrl, attempt.signal);
    if (attempt.signal.aborted) return;
    await player.play();
    await waitForVideoFrame(player, attempt.signal);
    if (!attempt.signal.aborted) {
      playbackReady.value = true;
      monitorPlayback(player, attempt);
      if (!player.paused && player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
        handleVideoWaiting();
    }
  } catch (error) {
    if (attempt.signal.aborted) return;
    if (error instanceof CameraServiceError && error.authorizationFailed) {
      invalidateConnection(error.message);
      return;
    }
    if (error instanceof PlaybackTicketExpiredError) {
      if (isRecovery) {
        reportPlaybackFailure('刷新播放会话后仍无法读取视频流，请检查服务端日志。');
        return;
      }
      await requestPlaybackRecovery();
      return;
    }
    if (error instanceof PlaybackFrameTimeoutError) {
      if (isRecovery) {
        reportPlaybackFailure(error.message);
        return;
      }
      await requestPlaybackRecovery();
      return;
    }
    reportPlaybackFailure(error instanceof Error ? error.message : '无法开始视频预览。');
  } finally {
    if (playbackAbort === attempt) starting.value = false;
  }
}

async function motorStep(direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
  const activeConnection = connection.value;
  const fingerprint = selectedCamera.value?.deviceFingerprint;
  if (!activeConnection || !fingerprint || !playbackReady.value || motorBusy.value) return;
  if (Date.now() - lastMotorStepAt < 1000) return;

  motorBusy.value = true;
  motorMessage.value = '';
  try {
    await authorizedRequest(
      activeConnection,
      `/api/xiaomi-camera/cameras/${encodeURIComponent(fingerprint)}/ptz`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      },
    );
    lastMotorStepAt = Date.now();
  } catch (error) {
    if (error instanceof CameraServiceError && error.authorizationFailed) {
      invalidateConnection(error.message);
      return;
    }
    motorMessage.value = error instanceof Error ? error.message : '无法发送云台指令。';
  } finally {
    motorBusy.value = false;
  }
}

function handleVideoError(): void {
  if (!hasPlaybackSource.value || starting.value) return;
  void requestPlaybackRecovery();
}

function handleViewerAction(): void {
  if (!hasConnection.value || connectionError.value) {
    openConnectionDialog();
    return;
  }
  void startPlayback();
}

watch(connectionDialogOpen, async (open) => {
  if (!open) {
    lastActiveElement?.focus();
    lastActiveElement = null;
    return;
  }
  lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  closeConnectionButton.value?.focus();
});

onMounted(async () => {
  const serviceUrl = draftServiceUrl.value;
  const accessCode = draftAccessCode.value;
  if (!serviceUrl || !accessCode) {
    openConnectionDialog();
    return;
  }

  try {
    connection.value = { serviceUrl: normalizeServiceUrl(serviceUrl), accessCode };
    await refreshDevices();
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : '无法读取已保存的服务配置。';
    openConnectionDialog();
  }
});

onBeforeUnmount(() => {
  deviceController?.abort();
  detachPlayback();
});
</script>

<template>
  <section class="camera-tool" aria-label="小米摄像头">
    <div class="camera-tool__viewer">
      <div class="camera-tool__viewer-toolbar">
        <span class="camera-tool__selected-name">{{
          selectedCamera?.displayName ?? '小米摄像头'
        }}</span>
        <div
          v-if="selectedCamera?.model === 'chuangmi.camera.079ac1'"
          class="camera-tool__motor-pad"
          role="group"
          aria-label="云台方向"
          title="直播画面有数秒延迟，请等待移动结果再继续操作"
        >
          <button
            type="button"
            aria-label="云台向左"
            title="向左"
            :disabled="!playbackReady || motorBusy"
            @click="motorStep('left')"
          >
            <IconArrowLeft :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="云台向上"
            title="向上"
            :disabled="!playbackReady || motorBusy"
            @click="motorStep('up')"
          >
            <IconArrowUp :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="云台向下"
            title="向下"
            :disabled="!playbackReady || motorBusy"
            @click="motorStep('down')"
          >
            <IconArrowDown :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="云台向右"
            title="向右"
            :disabled="!playbackReady || motorBusy"
            @click="motorStep('right')"
          >
            <IconArrowRight :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="camera-tool__toolbar-actions">
          <button
            class="camera-tool__icon-button"
            type="button"
            :disabled="!playbackReady || !audioAvailable"
            :aria-label="audioEnabled ? '关闭声音' : '开启声音'"
            :title="audioEnabled ? '关闭声音' : '开启声音'"
            @click="toggleAudio"
          >
            <IconVolume v-if="audioEnabled" :size="18" aria-hidden="true" />
            <IconVolumeOff v-else :size="18" aria-hidden="true" />
          </button>
          <button
            class="camera-tool__icon-button"
            type="button"
            :disabled="loadingDevices || !hasConnection"
            aria-label="刷新设备"
            title="刷新设备"
            @click="refreshDevices"
          >
            <IconRefresh :size="18" :class="{ 'is-spinning': loadingDevices }" aria-hidden="true" />
          </button>
          <button
            class="camera-tool__icon-button"
            type="button"
            aria-label="连接配置"
            title="连接配置"
            @click="openConnectionDialog"
          >
            <IconSettings :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="camera-tool__video-frame">
        <video
          v-show="hasPlaybackSource"
          ref="video"
          class="camera-tool__video"
          controls
          muted
          playsinline
          @error="handleVideoError"
          @playing="handleVideoPlaying"
          @waiting="handleVideoWaiting"
          @volumechange="handleVideoVolumeChange"
        />
        <span v-if="motorMessage" class="camera-tool__motor-error" role="status">{{
          motorMessage
        }}</span>
        <div
          v-if="!hasPlaybackSource || starting || connectionError || playbackError"
          class="camera-tool__placeholder"
        >
          <IconCamera v-if="!starting" :size="48" stroke-width="1.3" aria-hidden="true" />
          <IconRefresh v-else class="is-spinning" :size="38" aria-hidden="true" />
          <p
            v-if="viewerMessage"
            :class="{ 'is-error': connectionError || playbackError }"
            role="status"
          >
            {{ viewerMessage }}
          </p>
          <button
            v-if="starting"
            class="camera-tool__primary-button"
            type="button"
            @click="stopPlayback"
          >
            <IconX :size="18" aria-hidden="true" />
            取消等待
          </button>
          <button
            v-if="!starting"
            class="camera-tool__primary-button"
            type="button"
            :disabled="
              loadingDevices || (!connectionError && hasConnection && !selectedCamera?.isOnline)
            "
            @click="handleViewerAction"
          >
            <IconPlayerPlay :size="18" aria-hidden="true" />
            {{ viewerActionLabel }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="camera-tool-dialog">
        <div
          v-if="connectionDialogOpen"
          class="camera-tool-dialog"
          @click.self="closeConnectionDialog"
        >
          <section
            class="camera-tool-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="xiaomi-camera-connection-title"
          >
            <button
              ref="closeConnectionButton"
              class="camera-tool-dialog__close"
              type="button"
              aria-label="关闭连接配置"
              title="关闭"
              @click="closeConnectionDialog"
            >
              <IconX :size="18" aria-hidden="true" />
            </button>
            <form class="camera-tool-dialog__form" @submit.prevent="submitConnection">
              <div class="camera-tool-dialog__heading">
                <IconCamera :size="22" aria-hidden="true" />
                <h2 id="xiaomi-camera-connection-title">连接摄像头服务</h2>
              </div>
              <label>
                <span>服务地址</span>
                <input
                  v-model="draftServiceUrl"
                  type="url"
                  inputmode="url"
                  autocomplete="url"
                  placeholder="https://camera.example.com"
                  @input="handleServiceUrlInput"
                />
              </label>
              <label>
                <span>授权码</span>
                <input
                  ref="accessCodeInput"
                  v-model="draftAccessCode"
                  type="password"
                  autocomplete="current-password"
                  placeholder="输入授权码"
                />
              </label>
              <label class="camera-tool-dialog__remember">
                <input v-model="rememberAccessCode" type="checkbox" />
                <span>在此浏览器中记住授权码</span>
              </label>
              <label v-if="cameras.length > 1">
                <span>预览设备</span>
                <select v-model="dialogSelectedFingerprint">
                  <option
                    v-for="camera in cameras"
                    :key="camera.deviceFingerprint"
                    :value="camera.deviceFingerprint"
                  >
                    {{ camera.displayName }}（{{ camera.isOnline ? '在线' : '离线' }}）
                  </option>
                </select>
              </label>
              <p v-if="connectionError" class="camera-tool-dialog__error" role="status">
                {{ connectionError }}
              </p>
              <div class="camera-tool-dialog__actions">
                <button
                  v-if="hasConnection || draftAccessCode"
                  class="camera-tool-dialog__secondary-button"
                  type="button"
                  @click="forgetAuthorization"
                >
                  清除授权码
                </button>
                <button
                  class="camera-tool__primary-button"
                  type="submit"
                  :disabled="savingConnection"
                >
                  <IconRefresh
                    v-if="savingConnection"
                    class="is-spinning"
                    :size="17"
                    aria-hidden="true"
                  />
                  {{ savingConnection ? '正在连接' : '保存并连接' }}
                </button>
              </div>
            </form>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.camera-tool {
  --camera-tool-accent: var(--tools-accent, #7c3aed);
  min-width: 0;
  color: var(--color-text, #172033);
}

.camera-tool__viewer {
  display: grid;
  overflow: hidden;
  grid-template-rows: auto auto;
  border: 1px solid color-mix(in srgb, var(--color-border, #d6dbe8) 84%, transparent);
  border-radius: 1.1rem;
  background: var(--color-surface-solid, #fff);
  box-shadow: 0 1rem 3rem rgb(33 42 72 / 8%);
}

.camera-tool__viewer-toolbar {
  display: grid;
  min-height: 3.9rem;
  padding: 0.55rem 0.9rem;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border, #d6dbe8) 84%, transparent);
}

.camera-tool__selected-name {
  min-width: 0;
  overflow: hidden;
  font-size: 0.88rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-tool__toolbar-actions {
  display: flex;
  grid-column: 3;
  justify-self: end;
  gap: 0.35rem;
}

.camera-tool__icon-button {
  display: inline-grid;
  width: 2.35rem;
  height: 2.35rem;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0.62rem;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted, #687894);
  cursor: pointer;
}

.camera-tool__icon-button:hover:not(:disabled),
.camera-tool__icon-button:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--camera-tool-accent, #7c3aed) 25%, transparent);
  background: color-mix(in srgb, var(--camera-tool-accent, #7c3aed) 10%, transparent);
  color: var(--camera-tool-accent, #7c3aed);
}

.camera-tool__icon-button:disabled,
.camera-tool__primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.camera-tool__video-frame {
  position: relative;
  display: grid;
  min-height: 0;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #090e1b;
  place-items: center;
}

.camera-tool__video {
  grid-area: 1 / 1;
  z-index: 1;
  width: 100%;
  height: 100%;
  background: #090e1b;
  object-fit: contain;
}

.camera-tool__motor-pad {
  display: flex;
  padding: 0.2rem;
  grid-column: 2;
  gap: 0.15rem;
  border: 1px solid color-mix(in srgb, var(--color-border, #d6dbe8) 80%, transparent);
  border-radius: 0.75rem;
  background: var(--color-surface-soft, #f7f8fc);
}
.camera-tool__motor-pad button {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  padding: 0;
  border: 0;
  border-radius: 0.52rem;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted, #687894);
  cursor: pointer;
}
.camera-tool__motor-pad button:hover:not(:disabled),
.camera-tool__motor-pad button:focus-visible:not(:disabled) {
  background: color-mix(in srgb, var(--camera-tool-accent) 12%, transparent);
  color: var(--camera-tool-accent);
}
.camera-tool__motor-pad button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.camera-tool__motor-pad button:focus-visible {
  outline: 2px solid var(--camera-tool-accent);
  outline-offset: 2px;
}
.camera-tool__motor-error {
  position: absolute;
  z-index: 3;
  top: 0.75rem;
  left: 50%;
  max-width: calc(100% - 1.5rem);
  padding: 0.45rem 0.7rem;
  border-radius: 0.55rem;
  background: rgb(30 14 20 / 88%);
  color: #ffd7de;
  font-size: 0.76rem;
  text-align: center;
  transform: translateX(-50%);
}

.camera-tool__placeholder {
  z-index: 2;
  width: 100%;
  height: 100%;
  grid-area: 1 / 1;
  display: grid;
  max-width: none;
  padding: 1.5rem;
  place-self: stretch;
  justify-items: center;
  align-content: center;
  gap: 0.8rem;
  background: rgb(9 14 27 / 72%);
  color: #d2dbef;
  text-align: center;
}

.camera-tool__placeholder p {
  margin: 0;
  max-width: 24rem;
  font-size: 0.86rem;
}

.camera-tool__placeholder p.is-error {
  color: var(--color-danger, #ff9aaa);
}

.camera-tool__primary-button {
  display: inline-flex;
  min-height: 2.45rem;
  padding: 0 0.9rem;
  border: 1px solid color-mix(in srgb, var(--camera-tool-accent, #7c3aed) 55%, transparent);
  border-radius: 0.65rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  background: var(--camera-tool-accent, #7c3aed);
  color: #fff;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
}

.camera-tool__primary-button:hover:not(:disabled),
.camera-tool__primary-button:focus-visible:not(:disabled) {
  filter: brightness(1.06);
}

.is-spinning {
  animation: camera-tool-spin 760ms linear infinite;
}

@keyframes camera-tool-spin {
  to {
    transform: rotate(360deg);
  }
}

.camera-tool-dialog {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  padding: 1.25rem;
  place-items: center;
  background: rgb(7 12 25 / 42%);
}

.camera-tool-dialog__panel {
  position: relative;
  width: min(28rem, 100%);
  max-height: calc(100dvh - 2.5rem);
  overflow: auto;
  padding: 1.5rem;
  border: 1px solid var(--color-border, #d6dbe8);
  border-radius: 1rem;
  background: var(--color-surface-solid, #fff);
  box-shadow: 0 1.5rem 4rem rgb(7 12 25 / 26%);
}

.camera-tool-dialog__close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: grid;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: 0.5rem;
  place-items: center;
  background: transparent;
  color: var(--color-text-muted, #687894);
  cursor: pointer;
}

.camera-tool-dialog__close:hover,
.camera-tool-dialog__close:focus-visible {
  background: var(--color-surface-soft, #f4f6fb);
  color: var(--color-text, #172033);
}

.camera-tool-dialog__form,
.camera-tool-dialog__form label {
  display: grid;
}

.camera-tool-dialog__form {
  gap: 1rem;
}

.camera-tool-dialog__heading {
  display: flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.6rem;
  color: var(--camera-tool-accent, #7c3aed);
}

.camera-tool-dialog__heading h2 {
  margin: 0;
  color: var(--color-text, #172033);
  font-size: 1rem;
}

.camera-tool-dialog__form label:not(.camera-tool-dialog__remember) {
  gap: 0.38rem;
  color: var(--color-text-muted, #687894);
  font-size: 0.74rem;
  font-weight: 700;
}

.camera-tool-dialog__form input[type='url'],
.camera-tool-dialog__form input[type='password'],
.camera-tool-dialog__form select {
  width: 100%;
  min-height: 2.55rem;
  padding: 0 0.72rem;
  border: 1px solid var(--color-border, #d6dbe8);
  border-radius: 0.6rem;
  background: var(--color-surface-soft, #f7f8fc);
  color: var(--color-text, #172033);
  font: inherit;
}

.camera-tool-dialog__form input:focus-visible,
.camera-tool-dialog__form select:focus-visible {
  border-color: var(--camera-tool-accent, #7c3aed);
  outline: 2px solid color-mix(in srgb, var(--camera-tool-accent, #7c3aed) 25%, transparent);
  outline-offset: 1px;
}

.camera-tool-dialog__remember {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted, #687894);
  font-size: 0.75rem;
}

.camera-tool-dialog__remember input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--camera-tool-accent, #7c3aed);
}

.camera-tool-dialog__error {
  margin: 0;
  color: var(--color-danger, #c43b4d);
  font-size: 0.76rem;
}

.camera-tool-dialog__actions {
  position: sticky;
  bottom: -1.5rem;
  display: flex;
  padding: 1rem 0 0;
  justify-content: flex-end;
  gap: 0.6rem;
  background: var(--color-surface-solid, #fff);
}

.camera-tool-dialog__actions .camera-tool__primary-button {
  flex: 1;
}

.camera-tool-dialog__secondary-button {
  min-height: 2.45rem;
  padding: 0 0.8rem;
  border: 1px solid color-mix(in srgb, var(--color-danger, #c43b4d) 35%, transparent);
  border-radius: 0.65rem;
  background: transparent;
  color: var(--color-danger, #c43b4d);
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 700;
}

.camera-tool-dialog-enter-active,
.camera-tool-dialog-leave-active {
  transition: opacity 160ms ease;
}

.camera-tool-dialog-enter-active .camera-tool-dialog__panel,
.camera-tool-dialog-leave-active .camera-tool-dialog__panel {
  transition: transform 160ms ease;
}

.camera-tool-dialog-enter-from,
.camera-tool-dialog-leave-to {
  opacity: 0;
}

.camera-tool-dialog-enter-from .camera-tool-dialog__panel,
.camera-tool-dialog-leave-to .camera-tool-dialog__panel {
  transform: translateY(0.6rem) scale(0.98);
}

@media (max-width: 760px) {
  .camera-tool__motor-pad {
    display: none;
  }

  .camera-tool__viewer-toolbar {
    min-height: 3.4rem;
    padding: 0.45rem 0.55rem;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.3rem;
  }

  .camera-tool__toolbar-actions {
    grid-column: 2;
    gap: 0.1rem;
  }

  .camera-tool__icon-button {
    width: 2.2rem;
    height: 2.2rem;
  }

  .camera-tool__placeholder {
    padding: 0.75rem;
    gap: 0.55rem;
  }

  .camera-tool__placeholder > svg {
    width: 2rem;
    height: 2rem;
  }

  .camera-tool__placeholder p {
    font-size: 0.78rem;
  }
}

@media (max-width: 440px) {
  .camera-tool__viewer {
    border-radius: 0.85rem;
  }

  .camera-tool-dialog {
    padding: 0.75rem;
  }

  .camera-tool-dialog__panel {
    padding: 1.25rem;
  }
}
</style>
