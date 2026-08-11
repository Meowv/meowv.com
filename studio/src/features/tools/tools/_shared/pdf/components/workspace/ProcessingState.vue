<script setup lang="ts">
import { CircleStop } from '@/features/tools/tools/_shared/pdf/icons';

withDefaults(
  defineProps<{
    stage: string;
    progress?: number;
    total?: number;
  }>(),
  {
    progress: 0,
    total: 0,
  },
);

const emit = defineEmits<{
  cancel: [];
}>();
</script>

<template>
  <section class="processing-card" aria-live="polite" aria-busy="true">
    <span class="processing-spinner" aria-hidden="true"></span>
    <div>
      <strong>{{ stage || '正在处理文件' }}</strong>
      <p v-if="total > 0">正在处理第 {{ progress }} / {{ total }} 项</p>
      <p v-else>请保持此页面打开，所有操作都在当前浏览器内完成。</p>
    </div>
    <button type="button" class="button button--secondary" @click="emit('cancel')">
      <CircleStop :size="17" /> 取消处理
    </button>
  </section>
</template>
