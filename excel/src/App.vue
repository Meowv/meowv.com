<script setup lang="ts">
import { onErrorCaptured, onMounted, ref } from "vue";

import PwaUpdatePrompt from "./components/pwa/PwaUpdatePrompt.vue";
import { useSettingsStore } from "./stores/settings.store";

const fatalError = ref("");
const settingsStore = useSettingsStore();

function reloadApplication() {
  window.location.reload();
}

onErrorCaptured((error) => {
  fatalError.value = error instanceof Error ? error.message : "应用遇到未知错误";
  return false;
});

onMounted(() => {
  if (!settingsStore.loaded) void settingsStore.load().catch(() => undefined);
});
</script>

<template>
  <div v-if="fatalError" class="fatal-error" role="alert">
    <div class="fatal-error__card">
      <h1>页面暂时无法继续</h1>
      <p>{{ fatalError }}</p>
      <button type="button" class="button button--primary" @click="reloadApplication">
        重新加载
      </button>
    </div>
  </div>
  <RouterView v-else :key="$route.fullPath" />
  <PwaUpdatePrompt v-if="settingsStore.loaded && settingsStore.settings.enablePwa" />
</template>
