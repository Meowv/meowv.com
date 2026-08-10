<script setup lang="ts">
import { ref } from 'vue';
import JsonViewerTool from '../_shared/JsonViewerTool.vue';

const mode = ref<'tree' | 'graph'>('tree');
</script>

<template>
  <div class="tool-stack">
    <div class="tool-segmented" role="tablist" aria-label="JSON 可视化模式">
      <button type="button" :class="{ active: mode === 'tree' }" @click="mode = 'tree'">
        树形结构
      </button>
      <button type="button" :class="{ active: mode === 'graph' }" @click="mode = 'graph'">
        关系图谱
      </button>
    </div>
    <JsonViewerTool :key="mode" :mode="mode" />
  </div>
</template>
