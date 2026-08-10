<script setup lang="ts">
import { ref } from 'vue';
import CronGenerator from '../cron-generator/index.vue';
import CronParser from '../cron-parser/index.vue';

const activeMode = ref<'generate' | 'parse'>('generate');
</script>

<template>
  <div class="cron-tool">
    <div class="cron-tool__tabs" role="tablist" aria-label="Cron 表达式功能">
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'generate'"
        :class="{ 'is-active': activeMode === 'generate' }"
        @click="activeMode = 'generate'"
      >
        生成
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'parse'"
        :class="{ 'is-active': activeMode === 'parse' }"
        @click="activeMode = 'parse'"
      >
        解析
      </button>
    </div>
    <div v-show="activeMode === 'generate'">
      <CronGenerator />
    </div>
    <div v-show="activeMode === 'parse'">
      <CronParser />
    </div>
  </div>
</template>

<style scoped>
.cron-tool {
  display: grid;
  gap: 16px;
}
.cron-tool__tabs {
  display: inline-flex;
  justify-self: start;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.cron-tool__tabs button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.cron-tool__tabs button:last-child {
  border-right: 0;
}
.cron-tool__tabs button.is-active {
  background: var(--tools-accent);
  color: #fff;
}
</style>
