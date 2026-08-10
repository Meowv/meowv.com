<script setup lang="ts">
import { ref } from 'vue';
import JwtSecurityTool from '../_shared/JwtSecurityTool.vue';

type Mode = 'decode' | 'encode' | 'verify';

const mode = ref<Mode>('decode');
const options: Array<{ value: Mode; label: string }> = [
  { value: 'decode', label: '解码' },
  { value: 'encode', label: '编码' },
  { value: 'verify', label: '验证' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="JWT 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <JwtSecurityTool :key="mode" :mode="mode" />
  </div>
</template>
