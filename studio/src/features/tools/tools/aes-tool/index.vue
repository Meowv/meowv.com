<script setup lang="ts">
import { ref } from 'vue';
import AesTool from '../_shared/AesTool.vue';

type Mode = 'encrypt' | 'decrypt';

const mode = ref<Mode>('encrypt');
const options: Array<{ value: Mode; label: string }> = [
  { value: 'encrypt', label: '加密' },
  { value: 'decrypt', label: '解密' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="AES 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <AesTool :key="mode" :mode="mode" />
  </div>
</template>
