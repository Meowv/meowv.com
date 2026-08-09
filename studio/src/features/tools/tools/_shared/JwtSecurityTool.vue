<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconEraser, IconKey, IconShieldCheck } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { decodeJwtParts, encodeJwt, verifyJwt } from './security-crypto';

const props = defineProps<{
  mode: 'decode' | 'encode' | 'verify';
}>();

const token = ref('');
const payload = ref(`{
  "sub": "meowv-studio",
  "role": "developer"
}`);
const secret = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);

const title = computed(() => {
  if (props.mode === 'decode') return 'JWT 解码';
  if (props.mode === 'encode') return 'JWT 编码（HS256）';
  return 'JWT 验证（HS256）';
});

async function run(): Promise<void> {
  processing.value = true;
  error.value = '';
  try {
    if (props.mode === 'decode') {
      output.value = JSON.stringify(decodeJwtParts(token.value), null, 2);
      return;
    }
    if (props.mode === 'encode') {
      output.value = await encodeJwt(payload.value, secret.value);
      return;
    }
    const result = await verifyJwt(token.value, secret.value);
    output.value = JSON.stringify(
      {
        valid: result.validSignature && result.timeValid,
        signature: result.validSignature ? '有效' : '无效',
        time: result.timeValid ? '有效' : '无效',
        messages: result.messages,
        header: result.header,
        payload: result.payload,
      },
      null,
      2,
    );
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : 'JWT 处理失败。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  token.value = '';
  secret.value = '';
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="title" description="JWT 内容和密钥仅在当前浏览器内存中处理。">
      <div class="tool-stack">
        <ToolInput
          v-if="mode === 'encode'"
          v-model="payload"
          label="Payload JSON"
          placeholder="输入 JWT Payload"
          :rows="10"
        />
        <ToolInput
          v-else
          v-model="token"
          label="JWT Token"
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          :rows="8"
        />
        <label v-if="mode !== 'decode'" class="tool-field">
          <span>HMAC 密钥</span>
          <input v-model="secret" type="password" autocomplete="off" />
        </label>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="run"
          >
            <IconShieldCheck v-if="mode === 'verify'" :size="16" aria-hidden="true" />
            <IconKey v-else :size="16" aria-hidden="true" />
            {{
              processing
                ? '处理中…'
                : mode === 'decode'
                  ? '解码'
                  : mode === 'encode'
                    ? '编码'
                    : '验证'
            }}
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput
      :title="`${title}结果`"
      :value="output"
      :filename="mode === 'encode' ? 'token.txt' : 'jwt-result.json'"
      :mime-type="mode === 'encode' ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8'"
    />
  </div>
  <ToolHelp
    :steps="[
      mode === 'encode' ? '输入 Payload JSON 与密钥。' : '粘贴完整 JWT。',
      mode === 'decode'
        ? '解析 Header 与 Payload。'
        : mode === 'encode'
          ? '生成 HS256 签名。'
          : '输入密钥并验证签名与时间声明。',
      '复制或下载结果。',
    ]"
    :note="
      mode === 'decode'
        ? '解码不等于验证，不能据此信任 Token 内容。'
        : '当前仅支持 HS256；密钥不会持久化或发送到服务器。'
    "
  />
</template>
