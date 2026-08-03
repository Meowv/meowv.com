<script setup lang="ts">
import { ShieldCheck, SlidersHorizontal, X } from '@/features/pdf/icons';

interface WorkspaceUploadError {
  readonly name?: string;
  readonly message: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    ready?: boolean;
    uploadErrors?: readonly WorkspaceUploadError[];
    operationError?: string;
    additionalErrors?: readonly string[];
  }>(),
  {
    ready: false,
    uploadErrors: () => [],
    operationError: '',
    additionalErrors: () => [],
  },
);

const errorMessages = computed(() => {
  const messages = props.uploadErrors.map((error) =>
    error.name ? `${error.name}：${error.message}` : error.message,
  );
  if (props.operationError) {
    messages.push(props.operationError);
  }
  messages.push(...props.additionalErrors.filter(Boolean));
  return [...new Set(messages)];
});

const settingsOpen = ref(false);
const settingsButton = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

async function openSettings(): Promise<void> {
  settingsOpen.value = true;
  await nextTick();
  closeButton.value?.focus();
}

function closeSettings(): void {
  settingsOpen.value = false;
  settingsButton.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && settingsOpen.value) {
    closeSettings();
  }
}

watch(
  () => props.ready,
  (ready) => {
    if (!ready) {
      settingsOpen.value = false;
    }
  },
);

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <section class="workspace">
    <div class="workspace__privacy">
      <ShieldCheck :size="16" aria-hidden="true" />
      <span>本地处理 · 文件不上传</span>
    </div>
    <div
      v-if="errorMessages.length"
      class="notice notice--error"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <ul>
        <li v-for="message in errorMessages" :key="message">{{ message }}</li>
      </ul>
    </div>
    <div v-if="ready" class="workspace__grid">
      <div class="workspace__main">
        <slot name="main"></slot>
      </div>
      <button
        v-if="settingsOpen"
        class="workspace__settings-backdrop"
        type="button"
        aria-label="关闭处理参数"
        @click="closeSettings"
      ></button>
      <aside
        id="workspace-settings"
        class="workspace__settings"
        :class="{ 'is-open': settingsOpen }"
        :role="settingsOpen ? 'dialog' : undefined"
        :aria-modal="settingsOpen ? 'true' : undefined"
        aria-label="处理参数"
      >
        <div class="workspace__settings-drawer-header">
          <strong>处理参数</strong>
          <button
            ref="closeButton"
            type="button"
            class="icon-button"
            aria-label="关闭处理参数"
            @click="closeSettings"
          >
            <X :size="19" />
          </button>
        </div>
        <slot name="settings"></slot>
      </aside>
    </div>
    <div v-else class="workspace__empty">
      <slot></slot>
    </div>
    <div v-if="ready" class="workspace__action-bar">
      <button
        ref="settingsButton"
        type="button"
        class="button button--secondary workspace__settings-button"
        aria-controls="workspace-settings"
        :aria-expanded="settingsOpen"
        @click="openSettings"
      >
        <SlidersHorizontal :size="17" />
        参数
      </button>
      <slot name="actions"></slot>
    </div>
  </section>
</template>
