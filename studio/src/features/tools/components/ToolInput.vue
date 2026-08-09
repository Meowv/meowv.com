<script setup lang="ts">
const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    label: string;
    description?: string;
    placeholder?: string;
    rows?: number;
    spellcheck?: boolean;
  }>(),
  {
    description: '',
    placeholder: '',
    rows: 12,
    spellcheck: false,
  },
);
</script>

<template>
  <label class="tool-field tool-field--textarea">
    <span class="tool-field__label">{{ label }}</span>
    <small v-if="description">{{ description }}</small>
    <textarea
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      :spellcheck="spellcheck"
    ></textarea>
  </label>
</template>
