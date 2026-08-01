<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { editorSession } from '../lib/editor-session';

const isWorkspace = ref(document.body.classList.contains('workspace-active'));

const updateWorkspace = (event: Event) => {
  isWorkspace.value = (event as CustomEvent<boolean>).detail;
};

const renameDocument = (event: Event) => {
  editorSession.rename((event.target as HTMLInputElement).value);
};

onMounted(() => document.addEventListener('office:workspace-changed', updateWorkspace));
onBeforeUnmount(() => document.removeEventListener('office:workspace-changed', updateWorkspace));
</script>

<template>
  <header v-show="isWorkspace" class="workspace-header" aria-label="文档工具栏">
    <button
      class="workspace-brand"
      type="button"
      aria-label="返回 Meowv Office 首页"
      @click="editorSession.returnHome()"
    >
      <img class="brand-mark" src="/brand/office-mark.svg" alt="" />
      <span class="brand-copy"><b>Meowv Office</b></span>
    </button>
    <input id="workspace-file-name" class="workspace-file-name" aria-label="导出文件名" @change="renameDocument" />
    <span id="workspace-status" class="workspace-status" role="status">正在加载…</span>
  </header>

  <section v-if="!isWorkspace" id="landing-hero">
    <RouterView />
  </section>
  <div v-show="isWorkspace" id="iframe"></div>
</template>
