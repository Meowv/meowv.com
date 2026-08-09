<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconRefresh, IconShieldCheck } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { assessPassword, generatePassword, generateRandomString } from './security-random';

const props = defineProps<{ mode: 'password' | 'random' | 'strength' }>();

const input = ref('');
const length = ref(24);
const alphabet = ref('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
const lower = ref(true);
const upper = ref(true);
const digits = ref(true);
const symbols = ref(true);
const output = ref('');
const error = ref('');

const title = computed(() =>
  props.mode === 'password'
    ? '安全密码生成器'
    : props.mode === 'random'
      ? '安全随机字符串'
      : '密码强度检测',
);

function run(): void {
  error.value = '';
  try {
    if (props.mode === 'password') {
      output.value = generatePassword(length.value, {
        lower: lower.value,
        upper: upper.value,
        digits: digits.value,
        symbols: symbols.value,
      });
    } else if (props.mode === 'random') {
      output.value = generateRandomString(length.value, alphabet.value);
    } else {
      output.value = JSON.stringify(assessPassword(input.value), null, 2);
    }
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '处理失败。';
  }
}
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="title" description="使用浏览器密码学安全随机源或本地强度估算。">
      <div class="tool-stack">
        <ToolInput
          v-if="mode === 'strength'"
          v-model="input"
          label="待检测密码"
          placeholder="输入密码"
          :rows="5"
        />
        <template v-else>
          <label class="tool-field">
            <span>长度</span>
            <input
              v-model.number="length"
              type="number"
              min="1"
              :max="mode === 'password' ? 256 : 4096"
            />
          </label>
          <label v-if="mode === 'random'" class="tool-field">
            <span>字符集</span>
            <input v-model="alphabet" />
          </label>
          <div v-else class="tool-options-grid">
            <label class="tool-check"><input v-model="lower" type="checkbox" />小写字母</label>
            <label class="tool-check"><input v-model="upper" type="checkbox" />大写字母</label>
            <label class="tool-check"><input v-model="digits" type="checkbox" />数字</label>
            <label class="tool-check"><input v-model="symbols" type="checkbox" />符号</label>
          </div>
        </template>
        <ToolActions>
          <button type="button" class="tool-button tool-button--primary" @click="run">
            <IconShieldCheck v-if="mode === 'strength'" :size="16" aria-hidden="true" />
            <IconRefresh v-else :size="16" aria-hidden="true" />
            {{ mode === 'strength' ? '检测强度' : '生成' }}
          </button>
        </ToolActions>
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput :title="`${title}结果`" :value="output" filename="security-result.txt" />
  </div>
  <ToolHelp
    :steps="['填写参数或待检测密码。', '执行本地安全处理。', '复制结果。']"
    note="强度和破解时间是基于字符空间的估算，不能替代泄露密码库检测。"
  />
</template>
