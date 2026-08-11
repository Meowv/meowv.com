<script setup lang="ts">
import { ChevronDown } from '@/features/tools/tools/_shared/pdf/icons';

const props = defineProps<{
  modelValue: string | number;
  modelModifiers?: {
    number?: boolean;
  };
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

function updateValue(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emit('update:modelValue', props.modelModifiers?.number ? Number(value) : value);
}
</script>

<template>
  <span class="select-control">
    <select :value="modelValue" @change="updateValue">
      <slot />
    </select>
    <ChevronDown class="select-control__icon" :size="18" aria-hidden="true" />
  </span>
</template>
