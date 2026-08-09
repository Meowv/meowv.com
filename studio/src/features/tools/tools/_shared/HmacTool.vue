<script setup lang="ts">
import { ref } from 'vue';
import { IconEraser, IconKey } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { hmacText } from './security-crypto';
const props = defineProps<{ algorithm: 'MD5' | 'SHA-256' }>();
const message = ref('');
const key = ref('');
const output = ref('');
const error = ref('');
const processing = ref(false);
async function calculate(): Promise<void> {
  processing.value = true;
  error.value = '';
  try {
    output.value = await hmacText(props.algorithm, key.value, message.value);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : 'HMAC 计算失败。';
  } finally {
    processing.value = false;
  }
}
function clear(): void {
  message.value = '';
  key.value = '';
  output.value = '';
  error.value = '';
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="`HMAC-${algorithm}`" description="使用密钥为 UTF-8 文本生成消息认证码。"
      ><div class="tool-stack">
        <ToolInput v-model="message" label="消息" placeholder="Meowv Studio" /><label
          class="tool-field"
          ><span>密钥</span><input v-model="key" type="password" autocomplete="off" /></label
        ><ToolActions
          ><button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="calculate"
          >
            <IconKey :size="16" aria-hidden="true" />计算 HMAC</button
          ><button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div></ToolSection
    ><ToolOutput :title="`HMAC-${algorithm} 结果`" :value="output" filename="hmac.txt" />
  </div>
  <ToolHelp
    :steps="['输入消息与密钥。', '计算 HMAC。', '复制十六进制结果。']"
    :note="
      algorithm === 'MD5'
        ? 'HMAC-MD5 仅用于兼容旧系统；新系统应选择 HMAC-SHA256。'
        : '密钥和消息只在当前浏览器内存中处理。'
    "
  />
</template>
