<script setup lang="ts">
import { ref } from 'vue';
import { IconEraser, IconLock, IconLockOpen } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { aesDecrypt, aesEncrypt } from './security-crypto';

const props = defineProps<{
  mode: 'encrypt' | 'decrypt';
}>();

const input = ref('');
const password = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);

async function run(): Promise<void> {
  processing.value = true;
  error.value = '';
  try {
    output.value =
      props.mode === 'encrypt'
        ? await aesEncrypt(input.value, password.value)
        : await aesDecrypt(input.value, password.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : 'AES 处理失败。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  input.value = '';
  password.value = '';
  output.value = '';
  error.value = '';
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="mode === 'encrypt' ? 'AES 加密' : 'AES 解密'"
      :description="
        mode === 'encrypt'
          ? '使用 AES-256-GCM 与 PBKDF2-SHA256 加密 UTF-8 文本。'
          : '解密由本工具生成的 AES-256-GCM JSON 数据。'
      "
    >
      <div class="tool-stack">
        <ToolInput
          v-model="input"
          :label="mode === 'encrypt' ? '明文' : '加密数据 JSON'"
          :placeholder="mode === 'encrypt' ? '输入需要加密的内容' : '粘贴本工具生成的 JSON'"
          :rows="12"
        />
        <label class="tool-field">
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="off" />
        </label>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="run"
          >
            <IconLock v-if="mode === 'encrypt'" :size="16" aria-hidden="true" />
            <IconLockOpen v-else :size="16" aria-hidden="true" />
            {{ processing ? '处理中…' : mode === 'encrypt' ? '加密' : '解密' }}
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
      :title="mode === 'encrypt' ? '加密结果' : '解密结果'"
      :value="output"
      :filename="mode === 'encrypt' ? 'aes-encrypted.json' : 'aes-decrypted.txt'"
      :mime-type="
        mode === 'encrypt' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'
      "
    />
  </div>
  <ToolHelp
    :steps="[
      mode === 'encrypt' ? '输入明文与密码。' : '粘贴加密 JSON 并输入原密码。',
      mode === 'encrypt' ? '生成随机盐和随机 IV 后加密。' : '校验认证标签并解密。',
      '复制或下载结果。',
    ]"
    note="密码不会保存；请同时妥善保管加密 JSON，遗失密码后无法恢复。"
  />
</template>
