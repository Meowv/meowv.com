<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from '@/composables/useTheme';
import { drawWelcomeBackgroundVisible } from '@/core/shared/route-state';

const router = useRouter();
const { setPreference } = useTheme();
const editorHost = ref<HTMLElement | null>(null);
const loadError = ref('');
let disposeEditor: (() => void) | null = null;

function reloadPage(): void {
  window.location.reload();
}

function setVideoWelcomeVisible(visible: boolean): void {
  drawWelcomeBackgroundVisible.value = visible;
}

onMounted(async () => {
  if (!editorHost.value) return;

  try {
    const { mountDrawEditor } = await import('@/features/draw/editor');
    disposeEditor = mountDrawEditor(editorHost.value, {
      returnToStudio: () => void router.push('/'),
      setTheme: setPreference,
      onVideoWelcomeChange: setVideoWelcomeVisible,
    });
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '白板加载失败，请稍后重试。';
  }
});

onBeforeUnmount(() => {
  drawWelcomeBackgroundVisible.value = false;
  disposeEditor?.();
  disposeEditor = null;
});
</script>

<template>
  <section ref="editorHost" class="draw-page" aria-label="白板">
    <div v-if="loadError" class="draw-page__error" role="alert">
      <strong>白板加载失败</strong>
      <p>{{ loadError }}</p>
      <button type="button" @click="reloadPage">重新加载</button>
    </div>
  </section>
</template>

<style scoped>
.draw-page {
  --color-brand: var(--menu-draw);
  --color-brand-strong: #5753c9;
  --color-brand-soft: #e9e9ff;
  --color-border-strong: rgb(105 101 219 / 36%);
  --shadow-action: 0 12px 28px rgb(105 101 219 / 24%);
  width: 100%;
  height: 100%;
  min-height: 0;
}

.draw-page__error {
  display: grid;
  width: min(440px, calc(100% - 32px));
  min-height: 100%;
  margin: 0 auto;
  padding: 32px 0;
  align-content: center;
  gap: 12px;
  color: var(--color-text);
}

.draw-page__error p {
  margin: 0;
  color: var(--color-text-muted);
}

.draw-page__error button {
  width: fit-content;
  padding: 9px 14px;
  border: 0;
  border-radius: var(--radius-sm);
  color: #fff;
  background: var(--color-brand);
  cursor: pointer;
}
</style>
