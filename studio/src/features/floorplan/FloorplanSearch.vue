<script setup lang="ts">
import { ref } from 'vue';
import { IconSearch, IconX } from '@tabler/icons-vue';

defineProps<{ label: string }>();
const query = defineModel<string>({ required: true });
const input = ref<HTMLInputElement | null>(null);

function clear() {
  query.value = '';
  input.value?.focus();
}
</script>

<template>
  <div class="fp-search">
    <IconSearch :size="16" aria-hidden="true" />
    <input ref="input" v-model="query" :placeholder="label" :aria-label="label" />
    <button
      v-if="query"
      class="fp-search-clear"
      type="button"
      :aria-label="`清除${label}`"
      :title="`清除${label}`"
      @click="clear"
    >
      <IconX :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
