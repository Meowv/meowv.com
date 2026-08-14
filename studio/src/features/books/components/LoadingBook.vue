<script setup lang="ts">
import { IconBook2 } from '@tabler/icons-vue';

withDefaults(
  defineProps<{
    message?: string;
    progress?: number;
  }>(),
  { message: '正在整理书页…', progress: 0 },
);

defineEmits<{
  cancel: [];
}>();
</script>

<template>
  <section class="books-loading" aria-live="polite" aria-label="正在打开本地书籍">
    <div class="books-loading__book" aria-hidden="true">
      <IconBook2 :size="58" stroke-width="1.2" />
      <span></span>
      <span></span>
      <span></span>
    </div>
    <strong>{{ message }}</strong>
    <p>封面和第一页准备好后，书就会出现</p>
    <span
      class="books-loading__progress"
      role="progressbar"
      aria-label="书籍加载进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
      ><i :style="{ width: `${Math.round(progress * 100)}%` }"></i
    ></span>
    <button type="button" @click="$emit('cancel')">返回书架</button>
  </section>
</template>
