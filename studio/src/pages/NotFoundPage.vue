<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const fallbackMessage = '这个页面消失了…';
const message = ref(fallbackMessage);
const messageIsLong = computed(() => Array.from(message.value).length > 30);
let requestController: AbortController | null = null;

onMounted(async () => {
  requestController = new AbortController();

  try {
    const response = await fetch('https://v1.hitokoto.cn/?encode=text', {
      cache: 'no-store',
      signal: requestController.signal,
    });
    if (!response.ok) return;

    const text = (await response.text()).trim();
    if (text) message.value = text;
  } catch {
    message.value = fallbackMessage;
  }
});

onBeforeUnmount(() => {
  requestController?.abort();
  requestController = null;
});
</script>

<template>
  <section class="empty-page">
    <h1 :class="{ 'empty-page__title--wrapped': messageIsLong }">{{ message }}</h1>
  </section>
</template>
