<script setup lang="ts">
import { IconSearch, IconX } from '@tabler/icons-vue';

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function updateValue(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <label class="tools-search">
    <IconSearch :size="21" stroke-width="1.9" aria-hidden="true" />
    <span class="visually-hidden">查找工具</span>
    <input
      type="search"
      :value="modelValue"
      :placeholder="placeholder ?? '输入名称或关键词快速查找工具...'"
      autocomplete="off"
      @input="updateValue"
    />
    <button
      v-if="modelValue"
      type="button"
      aria-label="清空搜索"
      title="清空搜索"
      @click="emit('update:modelValue', '')"
    >
      <IconX :size="18" aria-hidden="true" />
    </button>
  </label>
</template>
