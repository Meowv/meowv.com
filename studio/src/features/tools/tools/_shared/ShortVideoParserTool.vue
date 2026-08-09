<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { IconEraser, IconLink, IconPlayerStop } from '@tabler/icons-vue';
import { remoteServices } from '@/features/tools/config/remoteServices';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

const input = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);
let controller: AbortController | null = null;

function extractUrl(text: string): string {
  const match = text.trim().match(/https?:\/\/[^\s\u3000-\u303f\uff00-\uffef]+/i);
  if (!match) throw new Error('未检测到有效的 HTTP 或 HTTPS 分享链接。');
  return match[0].replace(/[，。！？、；："'（）【】《》…—\s]+$/, '');
}

async function parse(): Promise<void> {
  error.value = '';
  output.value = '';
  let shareUrl: string;
  try { shareUrl = extractUrl(input.value); new URL(shareUrl); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '链接格式不正确。'; return; }
  controller?.abort();
  controller = new AbortController();
  processing.value = true;
  const timeout = window.setTimeout(() => controller?.abort('timeout'), remoteServices.shortVideo.timeoutMs);
  try {
    const endpoint = new URL('/api/short_videos', remoteServices.shortVideo.origin);
    endpoint.searchParams.set('url', shareUrl);
    const response = await fetch(endpoint, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw new Error(`解析服务返回 HTTP ${response.status}。`);
    const payload = (await response.json()) as { code?: number; msg?: string; data?: Record<string, unknown> };
    if (payload.code !== 200) throw new Error(payload.msg || '解析服务未返回有效视频信息。');
    if (!payload.data || !payload.data.url) throw new Error('解析结果中没有可用的视频地址。');
    output.value = JSON.stringify({ provider: remoteServices.shortVideo.provider, submittedUrl: shareUrl, ...payload.data }, null, 2);
  } catch (cause) {
    if (controller?.signal.aborted) error.value = controller.signal.reason === 'timeout' ? '请求超过 15 秒，已自动取消。' : '请求已取消。';
    else error.value = cause instanceof Error ? cause.message : '短视频解析失败。';
  } finally {
    window.clearTimeout(timeout);
    processing.value = false;
    controller = null;
  }
}
function cancel(): void { controller?.abort('cancel'); }
function clear(): void { cancel(); input.value = ''; output.value = ''; error.value = ''; }
onBeforeUnmount(cancel);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="短视频解析" description="调用 Blog 使用的 BugPK 服务解析公开短视频分享链接。">
      <div class="tool-stack">
        <ToolInput v-model="input" label="分享文本或链接" placeholder="可直接粘贴包含链接的完整分享文本" :rows="7" />
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" :disabled="processing" @click="parse"><IconLink :size="16" aria-hidden="true" />{{ processing ? '解析中…' : '解析视频' }}</button>
          <button type="button" class="tool-button tool-button--secondary" :disabled="!processing" @click="cancel"><IconPlayerStop :size="16" aria-hidden="true" />取消</button>
          <button type="button" class="tool-button tool-button--danger" @click="clear"><IconEraser :size="16" aria-hidden="true" />清空</button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="解析结果" :value="output" filename="short-video-result.json" mime-type="application/json;charset=utf-8" />
  </div>
  <ToolHelp :steps="['粘贴短视频平台的公开分享文本或链接。', '工具提取链接并发送到解析服务。', '检查标题、作者、封面及媒体地址等结构化结果。']" note="分享链接会发送到 api.bugpk.com；Studio 不保存链接或结果。请遵守内容平台规则与著作权要求。" />
</template>
