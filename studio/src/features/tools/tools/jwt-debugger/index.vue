<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconBug, IconEraser } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeJwt, formatJwt, type DecodedJwt } from './utils';

const example =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtZW93di1zdHVkaW8iLCJuYW1lIjoi5pys5Zyw5bel5YW3IiwiaWF0IjoxNzE3MjAwMDAwfQ.signature-demo';
const input = ref('');
const decoded = ref<DecodedJwt | null>(null);
const error = ref('');
const output = computed(() => (decoded.value ? formatJwt(decoded.value) : ''));

function inspect(): void {
  error.value = '';
  try {
    decoded.value = decodeJwt(input.value);
  } catch (cause) {
    decoded.value = null;
    error.value = cause instanceof Error ? cause.message : 'JWT 解析失败。';
  }
}

function clear(): void {
  input.value = '';
  decoded.value = null;
  error.value = '';
}

function formatDate(value?: Date): string {
  return value && !Number.isNaN(value.getTime())
    ? `${value.toLocaleString()} · ${value.toISOString()}`
    : '—';
}
</script>

<template>
  <ToolSection title="输入 JWT" description="只解析令牌结构，不验证签名与可信来源。">
    <div class="tool-stack">
      <ToolInput v-model="input" label="JWT Token" placeholder="eyJhbGciOi..." :rows="7" />
      <ToolActions>
        <button type="button" class="tool-button tool-button--primary" @click="inspect">
          <IconBug :size="16" aria-hidden="true" />
          解析 JWT
        </button>
        <button type="button" class="tool-button tool-button--quiet" @click="input = example">
          使用示例
        </button>
        <button type="button" class="tool-button tool-button--danger" @click="clear">
          <IconEraser :size="16" aria-hidden="true" />
          清空
        </button>
      </ToolActions>
      <p class="tool-status tool-status--error">
        安全提示：解码成功不代表令牌有效，签名必须由可信服务端使用密钥验证。
      </p>
      <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
    </div>
  </ToolSection>

  <div class="tool-workspace-grid">
    <ToolOutput
      title="Header 与 Payload"
      description="JSON 内容经过 Base64URL 解码后展示。"
      :value="output"
      filename="jwt-decoded.txt"
    />
    <ToolSection title="标准时间声明" description="仅当声明值为 Unix 秒级时间戳时展示。">
      <ul class="tool-result-list">
        <li><strong>iat · 签发时间</strong>{{ formatDate(decoded?.issuedAt) }}</li>
        <li><strong>nbf · 生效时间</strong>{{ formatDate(decoded?.notBefore) }}</li>
        <li><strong>exp · 过期时间</strong>{{ formatDate(decoded?.expiresAt) }}</li>
        <li><strong>签名状态</strong>未验证</li>
      </ul>
    </ToolSection>
  </div>

  <ToolHelp
    :steps="[
      '粘贴完整 JWT。',
      '点击解析 JWT 查看 Header 与 Payload。',
      '检查时间声明，并在可信服务端验证签名。',
    ]"
    note="工具不会发送或保存令牌，但仍不建议在不可信设备上处理生产凭据。"
  />
</template>
