<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRegisterSW } from "virtual:pwa-register/vue";

const online = ref(navigator.onLine);
const dismissedOffline = ref(false);

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisterError(error) {
    console.error("Service Worker 注册失败", error);
  },
});

const showOffline = computed(
  () => (!online.value || offlineReady.value) && !dismissedOffline.value,
);

function syncOnlineState() {
  online.value = navigator.onLine;
  if (online.value) dismissedOffline.value = false;
}

async function reloadWithUpdate() {
  const pendingSaves: Promise<unknown>[] = [];
  window.dispatchEvent(
    new CustomEvent("meowv:before-app-update", {
      detail: {
        waitUntil(promise: Promise<unknown>) {
          pendingSaves.push(promise);
        },
      },
    }),
  );
  const results = await Promise.allSettled(pendingSaves);
  if (results.some((result) => result.status === "rejected")) return;
  await updateServiceWorker(true);
}

onMounted(() => {
  window.addEventListener("online", syncOnlineState);
  window.addEventListener("offline", syncOnlineState);
});

onBeforeUnmount(() => {
  window.removeEventListener("online", syncOnlineState);
  window.removeEventListener("offline", syncOnlineState);
});
</script>

<template>
  <aside v-if="needRefresh" class="pwa-notice pwa-notice--update" aria-live="polite">
    <div>
      <strong>发现新版本</strong>
      <p>立即更新前会先保存当前内容。</p>
    </div>
    <div class="pwa-notice__actions">
      <button type="button" class="button button--ghost" @click="needRefresh = false">稍后</button>
      <button type="button" class="button button--primary" @click="reloadWithUpdate">
        立即更新
      </button>
    </div>
  </aside>

  <aside v-else-if="showOffline" class="pwa-notice pwa-notice--offline" aria-live="polite">
    <span>{{ online ? "应用已可离线使用" : "当前离线，本地编辑仍可继续" }}</span>
    <button type="button" aria-label="关闭提示" @click="dismissedOffline = true">关闭</button>
  </aside>
</template>

<style scoped>
.pwa-notice {
  position: fixed;
  z-index: 5000;
  right: 20px;
  bottom: 20px;
  display: flex;
  max-width: min(440px, calc(100vw - 32px));
  align-items: center;
  gap: 18px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  padding: 14px 16px;
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.pwa-notice strong {
  display: block;
  margin-bottom: 2px;
  font-size: 14px;
}

.pwa-notice p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.pwa-notice__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.pwa-notice--offline {
  border-color: var(--primary-border);
  background: var(--primary-surface);
  font-size: 13px;
}

.pwa-notice--offline button {
  border: 0;
  background: transparent;
  color: var(--primary-700);
  cursor: pointer;
}

@media (max-width: 640px) {
  .pwa-notice {
    right: 16px;
    bottom: 16px;
    left: 16px;
    flex-wrap: wrap;
  }
}
</style>
