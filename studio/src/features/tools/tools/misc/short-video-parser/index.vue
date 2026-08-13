<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { IconDownload, IconLoader2, IconPlayerPlay, IconUser } from '@tabler/icons-vue';
import { downloadBlob } from '@/core/browser/download';

interface ShortVideoAuthor {
  name: string;
  avatar: string;
}

interface ShortVideoVariant {
  url: string;
  quality: string;
  format: string;
  codec: string;
  bitrate: number;
}

interface ShortVideoResult {
  url: string;
  cover: string;
  title: string;
  description: string;
  duration: number;
  author: ShortVideoAuthor | null;
  variants: ShortVideoVariant[];
}

const input = ref('');
const result = ref<ShortVideoResult | null>(null);
const playingUrl = ref('');
const error = ref('');
const processing = ref(false);
const downloadingUrl = ref('');
const resultElement = ref<HTMLElement | null>(null);
const playerElement = ref<HTMLElement | null>(null);
let requestController: AbortController | null = null;
let downloadController: AbortController | null = null;

const canParse = computed(() => Boolean(input.value.trim()) && !processing.value);
const hasAuthor = computed(() =>
  Boolean(result.value?.author?.name || result.value?.author?.avatar),
);

function extractUrl(text: string): string {
  const match = text.trim().match(/https?:\/\/[^\s\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/iu);
  if (!match) throw new Error('未检测到有效链接，请检查输入内容。');
  return match[0].replace(/[，。！？、；："'（）【】《》…—\s]+$/u, '');
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeResult(value: unknown): ShortVideoResult {
  const data = objectValue(value);
  const videoUrl = safeHttpUrl(data?.url);
  if (!data || !videoUrl) throw new Error('未获取到视频信息，请检查链接是否正确。');

  const authorData = objectValue(data.author);
  const author = authorData
    ? {
        name: textValue(authorData.name),
        avatar: safeHttpUrl(authorData.avatar),
      }
    : null;
  const variants = Array.isArray(data.video_backup)
    ? data.video_backup
        .map((item): ShortVideoVariant | null => {
          const variant = objectValue(item);
          const url = safeHttpUrl(variant?.url);
          if (!variant || !url) return null;
          return {
            url,
            quality: textValue(variant.quality),
            format: textValue(variant.format),
            codec: textValue(variant.codec),
            bitrate: numberValue(variant.bit_rate),
          };
        })
        .filter((item): item is ShortVideoVariant => item !== null)
    : [];

  return {
    url: videoUrl,
    cover: safeHttpUrl(data.cover),
    title: textValue(data.title),
    description: textValue(data.desc),
    duration: numberValue(data.duration),
    author: author && (author.name || author.avatar) ? author : null,
    variants,
  };
}

function formatDuration(milliseconds: number): string {
  if (!milliseconds) return '';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBitrate(bitrate: number): string {
  if (!bitrate) return '—';
  if (bitrate >= 1_000_000) return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
  if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
  return `${bitrate} bps`;
}

function variantFormat(variant: ShortVideoVariant): string {
  return [variant.format, variant.codec].filter(Boolean).join(' ') || '—';
}

function videoFilename(url: string, contentType: string, format = ''): string {
  const normalizedFormat = format.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const typeExtension = contentType.match(/^video\/([a-z0-9.+-]+)/iu)?.[1]?.split('+')[0] ?? '';
  const pathExtension = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/iu)?.[1] ?? '';
  const allowed = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi']);
  const extension = [normalizedFormat, typeExtension, pathExtension].find((item) =>
    allowed.has(item),
  );
  return `video_${Date.now()}.${extension || 'mp4'}`;
}

function scrollTo(element: HTMLElement | null): void {
  element?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

async function parse(): Promise<void> {
  if (processing.value) return;
  error.value = '';
  result.value = null;
  playingUrl.value = '';

  let shareUrl: string;
  try {
    if (!input.value.trim()) throw new Error('请输入分享链接。');
    shareUrl = extractUrl(input.value);
    const parsedUrl = new URL(shareUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('链接格式不正确，需以 http:// 或 https:// 开头。');
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '链接格式不正确。';
    return;
  }

  requestController?.abort('replace');
  const controller = new AbortController();
  requestController = controller;
  processing.value = true;
  const timeout = window.setTimeout(() => controller.abort('timeout'), 15_000);

  try {
    const endpoint = new URL('/api/short_videos', 'https://api.bugpk.com');
    endpoint.searchParams.set('url', shareUrl);
    const response = await fetch(endpoint, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`解析服务返回 HTTP ${response.status}。`);

    const payload = (await response.json()) as {
      code?: number;
      msg?: string;
      data?: unknown;
    };
    if (payload.code !== 200) throw new Error(payload.msg || '解析失败，请稍后重试。');

    result.value = normalizeResult(payload.data);
    await nextTick();
    scrollTo(resultElement.value);
  } catch (cause) {
    if (controller.signal.aborted) {
      if (!['replace', 'unmount'].includes(String(controller.signal.reason))) {
        error.value =
          controller.signal.reason === 'timeout' ? '请求超时，请检查网络后重试。' : '请求已取消。';
      }
    } else {
      error.value = cause instanceof Error ? cause.message : '网络请求失败，请检查网络连接。';
    }
  } finally {
    window.clearTimeout(timeout);
    if (requestController === controller) {
      requestController = null;
      processing.value = false;
    }
  }
}

function handlePaste(): void {
  window.setTimeout(() => {
    try {
      input.value = extractUrl(input.value);
    } catch {
      // 分享文本未包含 URL 时保留原始输入，交由解析操作提示。
    }
  }, 50);
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  if (canParse.value) void parse();
}

async function playVideo(url?: string): Promise<void> {
  const target = safeHttpUrl(url || result.value?.url);
  if (!target) return;
  playingUrl.value = target;
  await nextTick();
  scrollTo(playerElement.value);
}

async function downloadVideo(url?: string, format = ''): Promise<void> {
  const target = safeHttpUrl(url || playingUrl.value || result.value?.url);
  if (!target || downloadingUrl.value) return;

  error.value = '';
  downloadController?.abort();
  const controller = new AbortController();
  downloadController = controller;
  downloadingUrl.value = target;

  try {
    const response = await fetch(target, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    downloadBlob(blob, videoFilename(target, blob.type, format));
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
      error.value = '视频下载失败，媒体地址可能不允许跨站读取，请稍后重试。';
    }
  } finally {
    if (downloadController === controller) {
      downloadController = null;
      downloadingUrl.value = '';
    }
  }
}

onBeforeUnmount(() => {
  requestController?.abort('unmount');
  downloadController?.abort();
});
</script>

<template>
  <div class="video-parser">
    <section class="tool-section" aria-label="短视频解析工作区">
      <div class="tool-section__body video-parser__input-panel">
        <div class="video-parser__input-row">
          <label class="video-parser__input">
            <span class="tool-visually-hidden">分享链接</span>
            <textarea
              v-model="input"
              rows="1"
              placeholder="粘贴分享链接或含链接的文本…"
              spellcheck="false"
              @keydown="handleInputKeydown"
              @paste="handlePaste"
            ></textarea>
          </label>
          <button
            type="button"
            class="tool-button tool-button--primary video-parser__parse"
            :disabled="!canParse"
            @click="parse"
          >
            <IconLoader2 v-if="processing" class="video-parser__spinner" :size="16" />
            <IconPlayerPlay v-else :size="16" aria-hidden="true" />
            {{ processing ? '解析中…' : '解析' }}
          </button>
        </div>

        <div v-if="processing" class="video-parser__loading" aria-live="polite" aria-busy="true">
          <IconLoader2 class="video-parser__spinner" :size="18" aria-hidden="true" />
          <span>解析中，请稍候…</span>
        </div>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </section>

    <section v-if="result" ref="resultElement" class="tool-section video-parser__result-card">
      <div class="tool-section__body video-parser__result">
        <div ref="playerElement" class="video-parser__media">
          <button
            v-if="result.cover && !playingUrl"
            type="button"
            class="video-parser__cover"
            aria-label="播放视频"
            @click="playVideo()"
          >
            <img
              :src="result.cover"
              :alt="result.title || '视频封面'"
              referrerpolicy="no-referrer"
            />
            <span><IconPlayerPlay :size="30" aria-hidden="true" /></span>
          </button>
          <div v-else-if="playingUrl" class="video-parser__player">
            <iframe
              :key="playingUrl"
              :src="playingUrl"
              title="短视频播放"
              allow="autoplay; fullscreen"
              allowfullscreen
              scrolling="no"
              referrerpolicy="no-referrer"
            ></iframe>
          </div>
          <button v-else type="button" class="video-parser__media-empty" @click="playVideo()">
            <IconPlayerPlay :size="24" aria-hidden="true" />
            <span>没有可用封面，点击播放视频</span>
          </button>
        </div>

        <div class="video-parser__download-bar">
          <button
            type="button"
            class="tool-button tool-button--primary video-parser__download"
            :disabled="Boolean(downloadingUrl)"
            @click="downloadVideo()"
          >
            <IconLoader2
              v-if="downloadingUrl === result.url"
              class="video-parser__spinner"
              :size="16"
            />
            <IconDownload v-else :size="16" aria-hidden="true" />
            {{ downloadingUrl === result.url ? '下载中…' : '下载视频' }}
          </button>
        </div>

        <div class="video-parser__details">
          <h2>{{ result.title || '暂无标题' }}</h2>
          <p class="video-parser__description">
            <span v-if="result.duration">{{ formatDuration(result.duration) }}</span>
            <span v-if="result.duration && result.description" aria-hidden="true"> · </span>
            <span>{{ result.description || '暂无描述' }}</span>
          </p>

          <div v-if="hasAuthor && result.author" class="video-parser__author">
            <img
              v-if="result.author.avatar"
              :src="result.author.avatar"
              alt="作者头像"
              referrerpolicy="no-referrer"
            />
            <span v-else aria-hidden="true"><IconUser :size="18" /></span>
            <strong>{{ result.author.name || '未知作者' }}</strong>
          </div>

          <section class="video-parser__variants" aria-labelledby="video-variants-title">
            <h3 id="video-variants-title">备用画质</h3>
            <div class="video-parser__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>画质</th>
                    <th>格式</th>
                    <th>码率</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="variant in result.variants" :key="variant.url">
                    <td>{{ variant.quality || '未知' }}</td>
                    <td>{{ variantFormat(variant) }}</td>
                    <td>{{ formatBitrate(variant.bitrate) }}</td>
                    <td>
                      <div class="video-parser__variant-actions">
                        <button
                          type="button"
                          class="video-parser__variant-button"
                          title="播放此画质"
                          aria-label="播放此画质"
                          @click="playVideo(variant.url)"
                        >
                          <IconPlayerPlay :size="14" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          class="video-parser__variant-button"
                          title="下载此画质"
                          aria-label="下载此画质"
                          :disabled="Boolean(downloadingUrl)"
                          @click="downloadVideo(variant.url, variant.format)"
                        >
                          <IconLoader2
                            v-if="downloadingUrl === variant.url"
                            class="video-parser__spinner"
                            :size="14"
                          />
                          <IconDownload v-else :size="14" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="result.variants.length === 0">
                    <td colspan="4" class="video-parser__empty">暂无备用画质</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.video-parser {
  display: grid;
  gap: 14px;
}

.video-parser__input-panel {
  display: grid;
  gap: 12px;
}

.video-parser__input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.video-parser__input {
  min-width: 0;
}

.video-parser__input textarea {
  display: block;
  width: 100%;
  height: 44px;
  padding: 11px 13px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  resize: none;
  background: var(--color-surface-soft);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.video-parser__input textarea:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  background: var(--color-surface-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.video-parser__input textarea::placeholder {
  color: var(--color-text-muted);
}

.video-parser__parse {
  min-width: 96px;
  min-height: 44px;
  padding-inline: 18px;
  border-radius: 22px;
}

.video-parser__loading {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.video-parser__spinner {
  animation: video-parser-spin 0.8s linear infinite;
}

.video-parser__result-card {
  scroll-margin-top: calc(var(--header-height) + 16px);
}

.video-parser__result {
  display: grid;
  gap: 14px;
}

.video-parser__media {
  min-width: 0;
  scroll-margin-top: calc(var(--header-height) + 16px);
}

.video-parser__cover {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  margin-inline: auto;
  background: #000;
  cursor: pointer;
}

.video-parser__cover img {
  display: block;
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
  transition: opacity 160ms ease;
}

.video-parser__cover > span {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  place-items: center;
  background: rgb(0 0 0 / 64%);
  color: #fff;
  transform: translate(-50%, -50%);
  transition:
    background-color 160ms ease,
    transform 160ms ease;
}

.video-parser__cover:hover img {
  opacity: 0.86;
}

.video-parser__cover:hover > span {
  background: rgb(0 0 0 / 76%);
  transform: translate(-50%, -50%) scale(1.05);
}

.video-parser__player {
  overflow: hidden;
  border-radius: 10px;
  background: #000;
}

.video-parser__player iframe {
  display: block;
  width: 100%;
  height: 70vh;
  min-height: 360px;
  max-height: 600px;
  border: 0;
  background: #000;
}

.video-parser__media-empty {
  display: grid;
  width: 100%;
  min-height: 220px;
  padding: 20px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  place-items: center;
  align-content: center;
  gap: 8px;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 11px;
}

.video-parser__media-empty:hover {
  border-color: color-mix(in srgb, var(--tools-accent) 48%, var(--color-border));
  color: var(--tools-accent);
}

.video-parser__download-bar {
  display: flex;
  justify-content: center;
}

.video-parser__download {
  min-height: 40px;
  padding-inline: 18px;
  border-radius: 20px;
}

.video-parser__details {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.video-parser__details > h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
}

.video-parser__description {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.video-parser__author {
  display: flex;
  min-height: 52px;
  padding-block: 8px;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  align-items: center;
  gap: 10px;
}

.video-parser__author img,
.video-parser__author > span {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 50%;
  place-items: center;
  background: var(--color-surface-soft);
  object-fit: cover;
  color: var(--tools-accent);
}

.video-parser__author strong {
  font-size: 12px;
}

.video-parser__variants h3 {
  margin: 0 0 9px;
  font-size: 12px;
}

.video-parser__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.video-parser__variants table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  table-layout: fixed;
}

.video-parser__variants th,
.video-parser__variants td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--color-border);
  text-align: center;
  word-break: break-word;
}

.video-parser__variants th {
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-weight: 720;
}

.video-parser__variants tr:last-child td {
  border-bottom: 0;
}

.video-parser__variants th:first-child {
  width: 18%;
}

.video-parser__variants th:nth-child(2) {
  width: 24%;
}

.video-parser__variants th:nth-child(3) {
  width: 22%;
}

.video-parser__variants th:last-child {
  width: 36%;
}

.video-parser__variant-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.video-parser__variant-button {
  display: inline-grid;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 56%, var(--color-border));
  border-radius: 50%;
  place-items: center;
  background: var(--tools-accent);
  color: #fff;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    transform 150ms ease;
}

.video-parser__variant-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tools-accent) 86%, #000);
  transform: translateY(-1px);
}

.video-parser__variant-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.video-parser__empty {
  padding-block: 16px !important;
  color: var(--color-text-muted);
}

@keyframes video-parser-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 600px) {
  .video-parser__input-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .video-parser__parse {
    width: 100%;
  }

  .video-parser__cover img {
    max-height: 300px;
  }

  .video-parser__player iframe {
    height: 52vh;
    min-height: 300px;
  }

  .video-parser__variants table {
    min-width: 460px;
  }
}
</style>
