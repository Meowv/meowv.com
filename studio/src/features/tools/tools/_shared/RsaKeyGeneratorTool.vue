<script setup lang="ts">
import { ref } from 'vue';
import { IconKey } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { generateRsaKeyPair } from './security-crypto';

const length = ref<2048 | 3072 | 4096>(2048);
const publicKey = ref('');
const privateKey = ref('');
const error = ref('');
const processing = ref(false);

async function generate(): Promise<void> {
  processing.value = true;
  error.value = '';
  publicKey.value = '';
  privateKey.value = '';
  try {
    const result = await generateRsaKeyPair(length.value);
    publicKey.value = result.publicKey;
    privateKey.value = result.privateKey;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'RSA 密钥生成失败。';
  } finally {
    processing.value = false;
  }
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection title="RSA 密钥对生成" description="使用浏览器 Web Crypto 生成 RSA-OAEP 密钥对。">
      <div class="tool-stack">
        <label class="tool-field">
          <span>密钥长度</span>
          <select v-model.number="length">
            <option :value="2048">2048 bit</option>
            <option :value="3072">3072 bit</option>
            <option :value="4096">4096 bit</option>
          </select>
        </label>
        <ToolActions>
          <button
            type="button"
            class="tool-button tool-button--primary"
            :disabled="processing"
            @click="generate"
          >
            <IconKey :size="16" aria-hidden="true" />
            {{ processing ? '生成中…' : '生成密钥对' }}
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <div class="tool-stack">
      <ToolOutput
        title="公钥（SPKI PEM）"
        :value="publicKey"
        filename="rsa-public-key.pem"
        :rows="10"
      />
      <ToolOutput
        title="私钥（PKCS#8 PEM）"
        :value="privateKey"
        filename="rsa-private-key.pem"
        :rows="14"
      />
    </div>
  </div>
  <ToolHelp
    :steps="['选择密钥长度。', '在浏览器内生成密钥对。', '分别下载公钥与私钥。']"
    note="私钥不会上传或保存；离开页面前请妥善下载，避免向他人泄露。"
  />
</template>
