<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type Hls from 'hls.js';
import type { ErrorData, Events } from 'hls.js';
import { IconCamera, IconPlayerPlay, IconRefresh, IconSettings, IconX } from '@tabler/icons-vue';
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
};

type PlaybackSessionPayload = { playlistUrl?: unknown; hlsUrl?: unknown };

class CameraServiceError extends Error {
  constructor(
    message: string,
    readonly authorizationFailed = false,
  ) {
    super(message);
  }
}

class PlaybackTicketExpiredError extends Error {}

const SERVICE_URL_KEY = `${STORAGE_POLICY.preferences}:xiaomi-camera-service-url`;
const ACCESS_CODE_KEY = `${STORAGE_POLICY.preferences}:xiaomi-camera-access-code`;

const cameras = ref<CameraDevice[]>([]);
const selectedFingerprint = ref<string>();
const connection = ref<CameraConnection>();
const draftServiceUrl = ref(readStoredValue(SERVICE_URL_KEY));
const draftAccessCode = ref(readStoredValue(ACCESS_CODE_KEY));
const rememberAccessCode = ref(Boolean(draftAccessCode.value));
const connectionDialogOpen = ref(false);
const connectionError = ref('');
const playbackError = ref('');
const loadingDevices = ref(false);
const savingConnection = ref(false);
const starting = ref(false);
const hasPlaybackSource = ref(false);
const video = ref<HTMLVideoElement>();
const closeConnectionButton = ref<HTMLButtonElement>();
const accessCodeInput = ref<HTMLInputElement>();
const dialogSelectedFingerprint = ref<string>();

let deviceController: AbortController | undefined;
let hls: Hls | undefined;
let playbackAbort: AbortController | undefined;
let recoveryAttempted = false;
let lastActiveElement: HTMLElement | null = null;
let dialogOriginalServiceUrl = draftServiceUrl.value;

const selectedCamera = computed(() =>
  cameras.value.find((camera) => camera.deviceFingerprint === selectedFingerprint.value),
);
const hasConnection = computed(() => Boolean(connection.value));
const viewerMessage = computed(() => {
  if (connectionError.value) return connectionError.value;
  if (playbackError.value) return playbackError.value;
  if (loadingDevices.value) return '正在读取设备…';
  if (!hasConnection.value) return '连接摄像头服务以开始预览';
  if (!cameras.value.length) return '服务中没有可用的摄像头';
  if (!selectedCamera.value?.isOnline) return '请选择一台在线摄像头';
  return '准备好后开始预览';
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
  const response = await authorizedRequest(activeConnection, '/api/cameras', { signal });
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
  const response = await authorizedRequest(activeConnection, '/api/playback-sessions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceFingerprint: fingerprint }),
  });
  const payload = (await response.json()) as PlaybackSessionPayload;
  const playlistUrl = payload.playlistUrl ?? payload.hlsUrl;
  if (typeof playlistUrl !== 'string' || !playlistUrl) {
    throw new CameraServiceError('摄像头服务未返回播放地址。');
  }

  try {
    return { playlistUrl: new URL(playlistUrl, `${activeConnection.serviceUrl}/`).toString() };
  } catch {
    throw new CameraServiceError('摄像头服务返回了无效的播放地址。');
  }
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
  playbackAbort?.abort();
  playbackAbort = undefined;
  hls?.destroy();
  hls = undefined;
  hasPlaybackSource.value = false;
  if (video.value) {
    video.value.pause();
    video.value.removeAttribute('src');
    video.value.load();
  }
}

function stopPlayback(): void {
  recoveryAttempted = false;
  starting.value = false;
  playbackError.value = '';
  detachPlayback();
}

function reportPlaybackFailure(message: string): void {
  detachPlayback();
  starting.value = false;
  playbackError.value = message;
}

async function requestPlaybackRecovery(): Promise<void> {
  if (recoveryAttempted) {
    reportPlaybackFailure('视频流已中断，请重新开始预览。');
    return;
  }
  recoveryAttempted = true;
  await startPlayback(true);
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
    const cancel = () => reject(new DOMException('播放已停止。', 'AbortError'));
    const manifestReady = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const handleError = (_event: Events.ERROR, data: ErrorData) => {
      if (!data.fatal || instance !== hls) return;
      const responseCode = data.response?.code;
      if (responseCode === 410) {
        signal.removeEventListener('abort', cancel);
        reject(new PlaybackTicketExpiredError());
        return;
      }
      if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR) {
        instance.recoverMediaError();
        return;
      }
      if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR) {
        instance.startLoad();
        return;
      }
      signal.removeEventListener('abort', cancel);
      reject(new CameraServiceError('HLS 播放器无法初始化。'));
    };

    signal.addEventListener('abort', cancel, { once: true });
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

  if (!isRecovery) recoveryAttempted = false;
  detachPlayback();
  starting.value = true;
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
    await attachHls(player, session.playlistUrl, attempt.signal);
    if (attempt.signal.aborted) return;
    await player.play();
  } catch (error) {
    if (attempt.signal.aborted) return;
    if (error instanceof CameraServiceError && error.authorizationFailed) {
      invalidateConnection(error.message);
      return;
    }
    if (error instanceof PlaybackTicketExpiredError) {
      await requestPlaybackRecovery();
      return;
    }
    reportPlaybackFailure(error instanceof Error ? error.message : '无法开始视频预览。');
  } finally {
    if (playbackAbort === attempt) starting.value = false;
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
        <div class="camera-tool__toolbar-actions">
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
        />
        <div
          v-if="!hasPlaybackSource || starting || connectionError || playbackError"
          class="camera-tool__placeholder"
        >
          <IconCamera v-if="!starting" :size="48" stroke-width="1.3" aria-hidden="true" />
          <IconRefresh v-else class="is-spinning" :size="38" aria-hidden="true" />
          <p :class="{ 'is-error': connectionError || playbackError }" role="status">
            {{ viewerMessage }}
          </p>
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
                <h2 id="xiaomi-camera-connection-title">连接 XiaomiCamera 服务</h2>
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
                  placeholder="输入服务端生成的授权码"
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
  min-height: min(70vh, 52rem);
  color: var(--color-text, #172033);
}

.camera-tool__viewer {
  display: grid;
  min-height: min(70vh, 52rem);
  overflow: hidden;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid color-mix(in srgb, var(--color-border, #d6dbe8) 84%, transparent);
  border-radius: 1.1rem;
  background: var(--color-surface-solid, #fff);
  box-shadow: 0 1rem 3rem rgb(33 42 72 / 8%);
}

.camera-tool__viewer-toolbar {
  display: flex;
  min-height: 3.75rem;
  padding: 0.65rem 0.75rem;
  align-items: center;
  gap: 0.5rem;
}

.camera-tool__selected-name {
  overflow: hidden;
  font-size: 0.84rem;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-tool__viewer-toolbar {
  justify-content: space-between;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border, #d6dbe8) 84%, transparent);
}

.camera-tool__toolbar-actions {
  display: flex;
  margin-left: auto;
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
  .camera-tool,
  .camera-tool__viewer {
    min-height: min(68vh, 38rem);
  }

  .camera-tool__video-frame {
    min-height: 15rem;
  }

  .camera-tool__selected-name {
    max-width: 12rem;
  }
}

@media (max-width: 440px) {
  .camera-tool__viewer-toolbar {
    padding-right: 0.55rem;
    padding-left: 0.55rem;
  }

  .camera-tool__selected-name {
    max-width: 7rem;
  }

  .camera-tool-dialog {
    padding: 0.75rem;
  }

  .camera-tool-dialog__panel {
    padding: 1.25rem;
  }
}
</style>
