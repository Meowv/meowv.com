<script setup lang="ts">
import { ref } from 'vue';
import UuidSecurityTool from '../_shared/UuidSecurityTool.vue';
import UuidV4GeneratorTool from '../_shared/UuidV4GeneratorTool.vue';

type Version = 'v4' | 'v1' | 'v7';

const version = ref<Version>('v4');
const options: Array<{ value: Version; label: string }> = [
  { value: 'v4', label: 'UUID v4（随机）' },
  { value: 'v1', label: 'UUID v1（时间）' },
  { value: 'v7', label: 'UUID v7（有序）' },
];
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>版本</span>
      <select v-model="version" aria-label="UUID 版本">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <UuidV4GeneratorTool v-if="version === 'v4'" :key="version" />
    <UuidSecurityTool v-else :key="version" :mode="version" />
  </div>
</template>
