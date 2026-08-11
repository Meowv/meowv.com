<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

const method = ref('GET');
const url = ref('https://httpbin.org/get');
const headers = ref('Accept: application/json');
const body = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);
const elapsed = ref(0);
const timeoutSeconds = ref(30);
let controller: AbortController | null = null;
let timeoutId: number | null = null;

const requestHasBody = computed(() => !['GET', 'HEAD'].includes(method.value));

function parseRequestHeaders(source: string): Headers {
  const result = new Headers();
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Header 第 ${index + 1} 行缺少冒号。`);
    result.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return result;
}

async function send(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  processing.value = true;
  output.value = '';
  error.value = '';
  elapsed.value = 0;
  const started = performance.now();
  try {
    const target = new URL(url.value.trim());
    if (!['http:', 'https:'].includes(target.protocol))
      throw new Error('仅支持 HTTP 或 HTTPS API。');
    timeoutId = window.setTimeout(() => controller?.abort('timeout'), timeoutSeconds.value * 1000);
    const response = await fetch(target, {
      method: method.value,
      headers: parseRequestHeaders(headers.value),
      body: requestHasBody.value && body.value ? body.value : undefined,
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    const responseBody = await response.text();
    elapsed.value = Math.round(performance.now() - started);
    output.value = [
      `${response.status} ${response.statusText}`,
      `URL: ${response.url}`,
      `耗时: ${elapsed.value} ms`,
      '',
      ...Array.from(response.headers, ([name, value]) => `${name}: ${value}`),
      '',
      responseBody,
    ].join('\n');
  } catch (cause) {
    elapsed.value = Math.round(performance.now() - started);
    if (cause instanceof DOMException && cause.name === 'AbortError')
      error.value =
        controller?.signal.reason === 'timeout'
          ? `请求超过 ${timeoutSeconds.value} 秒，已自动取消。`
          : '请求已取消。';
    else error.value = cause instanceof Error ? cause.message : '请求失败。';
  } finally {
    processing.value = false;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = null;
    controller = null;
  }
}

function cancel(): void {
  controller?.abort();
}
onBeforeUnmount(cancel);
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="HTTP 请求" description="直接从当前浏览器发送请求，不经过 Studio 服务器。">
      <div class="tool-stack">
        <div class="tool-api-request-line">
          <label class="tool-field"
            ><span>Method</span
            ><select v-model="method">
              <option
                v-for="item in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']"
                :key="item"
              >
                {{ item }}
              </option>
            </select></label
          >
          <label class="tool-field"><span>URL</span><input v-model="url" type="url" /></label>
        </div>
        <label class="tool-field"
          ><span>超时（秒）</span
          ><input v-model.number="timeoutSeconds" type="number" min="1" max="120"
        /></label>
        <ToolInput
          v-model="headers"
          label="Request Headers"
          placeholder="Content-Type: application/json"
          :rows="6"
        />
        <ToolInput
          v-if="requestHasBody"
          v-model="body"
          label="Request Body"
          placeholder='{"name":"Studio"}'
          :rows="8"
        />
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="send"
          >
            <IconPlayerPlay :size="16" aria-hidden="true" />{{
              processing ? '请求中…' : '发送请求'
            }}
          </button>
          <button
            type="button"
            class="tool-button tool-button--danger"
            :disabled="!processing"
            @click="cancel"
          >
            <IconPlayerStop :size="16" aria-hidden="true" />取消
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput title="HTTP 响应" :value="output" filename="api-response.txt" :rows="18" />
  </div>
  <ToolHelp
    :steps="['选择 Method 并输入 API URL。', '填写 Header 与可选 Body。', '发送请求并检查响应。']"
    note="请求会直接发送到填写的目标地址；目标服务必须允许浏览器 CORS。认证信息不会被 Studio 保存。"
  />
</template>
