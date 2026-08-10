<script setup lang="ts">
import { ref } from 'vue';
import QrGeneratorTool from '../_shared/QrGeneratorTool.vue';
import QrReaderTool from '../_shared/QrReaderTool.vue';

const activeMode = ref<'generate' | 'read'>('generate');
</script>

<template>
  <div class="qr-code-tool">
    <div class="qr-code-tool__tabs" role="tablist" aria-label="QR Code 功能">
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
        :aria-selected="activeMode === 'read'"
        :class="{ 'is-active': activeMode === 'read' }"
        @click="activeMode = 'read'"
      >
        识别
      </button>
    </div>
    <div v-show="activeMode === 'generate'">
      <QrGeneratorTool />
    </div>
    <div v-show="activeMode === 'read'">
      <QrReaderTool />
    </div>
  </div>
</template>

<style scoped>
.qr-code-tool {
  display: grid;
  gap: 16px;
}
.qr-code-tool__tabs {
  display: inline-flex;
  justify-self: start;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.qr-code-tool__tabs button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.qr-code-tool__tabs button:last-child {
  border-right: 0;
}
.qr-code-tool__tabs button.is-active {
  background: var(--tools-accent);
  color: #fff;
}
</style>
