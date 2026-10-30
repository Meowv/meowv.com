<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { ModelError, requestModel, saveConfig, validateConfig } from './api';
import type { ModelConfig } from './types';

const props = defineProps<{ config: ModelConfig | null }>();
const emit = defineEmits<{ saved: [config: ModelConfig]; close: [] }>();
const form = reactive<ModelConfig>({
  protocol: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  ...props.config,
});
const status = ref('');
const testing = ref(false);
let controller: AbortController | null = null;
function cancelTest() {
  controller?.abort();
}

function save() {
  try {
    validateConfig(form);
    saveConfig({ ...form });
    emit('saved', { ...form });
  } catch (cause) {
    status.value =
      cause instanceof ModelError ? cause.message : '配置保存失败，请检查浏览器本地存储权限。';
  }
}

async function test() {
  if (testing.value) return;
  try {
    validateConfig(form);
  } catch (cause) {
    status.value = cause instanceof ModelError ? cause.message : '请检查配置。';
    return;
  }
  const active = new AbortController();
  controller = active;
  testing.value = true;
  status.value = '正在测试…';
  try {
    await requestModel({ ...form }, [{ role: 'user', content: 'OK' }], active.signal, true);
    status.value = '连接成功，模型返回正常。';
  } catch (cause) {
    status.value = cause instanceof ModelError ? cause.message : '连接失败，请检查配置。';
  } finally {
    testing.value = false;
    controller = null;
  }
}
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <form class="pe-settings" @submit.prevent="save">
    <h2 id="pe-settings-title">模型设置</h2>
    <p>浏览器直接调用你的模型服务，发送内容包含当前对话上下文。</p>
    <label
      >API 协议<select v-model="form.protocol" :disabled="testing">
        <option value="openai">OpenAI 兼容</option>
        <option value="anthropic">Anthropic Messages</option>
      </select></label
    >
    <label
      >API 地址<input
        v-model.trim="form.baseUrl"
        type="url"
        placeholder="https://api.example.com/v1"
        required
        :disabled="testing"
        autocomplete="off"
    /></label>
    <label
      >API Key<input
        v-model.trim="form.apiKey"
        type="password"
        placeholder="填写 API Key"
        required
        :disabled="testing"
        autocomplete="off"
        spellcheck="false"
    /></label>
    <label
      >模型名称<input
        v-model.trim="form.model"
        placeholder="填写服务商提供的模型 ID"
        required
        :disabled="testing"
        autocomplete="off"
    /></label>
    <p v-if="status" class="pe-status" role="status">{{ status }}</p>
    <div class="pe-settings__actions">
      <button type="button" @click="emit('close')">取消</button>
      <button v-if="testing" type="button" @click="cancelTest">取消测试</button>
      <button v-else type="button" @click="test">测试连接</button>
      <button type="submit" class="pe-primary" :disabled="testing">保存配置</button>
    </div>
  </form>
</template>
