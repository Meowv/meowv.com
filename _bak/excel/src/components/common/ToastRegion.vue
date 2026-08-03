<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from "@lucide/vue";
import type { Component } from "vue";
import { computed } from "vue";

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  type?: "success" | "error" | "info";
}

const props = withDefaults(
  defineProps<{
    toasts?: ToastMessage[];
  }>(),
  {
    toasts: () => [],
  },
);

defineEmits<{
  dismiss: [id: string];
}>();

const iconByType: Record<NonNullable<ToastMessage["type"]>, Component> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const items = computed(() => props.toasts.map((toast) => ({ type: "info" as const, ...toast })));
</script>

<template>
  <div class="toast-region" aria-live="polite" aria-label="通知">
    <TransitionGroup name="toast">
      <article
        v-for="toast in items"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.type}`"
        :role="toast.type === 'error' ? 'alert' : 'status'"
      >
        <component
          :is="iconByType[toast.type]"
          class="toast__icon"
          :size="19"
          :stroke-width="1.9"
        />
        <div class="toast__copy">
          <strong>{{ toast.title }}</strong>
          <p v-if="toast.message">{{ toast.message }}</p>
        </div>
        <button type="button" aria-label="关闭通知" @click="$emit('dismiss', toast.id)">
          <X :size="17" />
        </button>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  z-index: 1200;
  top: 20px;
  right: 20px;
  display: grid;
  width: min(380px, calc(100vw - 40px));
  gap: 10px;
  pointer-events: none;
}

.toast {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 13px 12px 13px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 9px 28px rgb(27 40 32 / 12%);
  color: var(--text);
  pointer-events: auto;
}

.toast__icon {
  margin-top: 1px;
  color: var(--text-secondary);
}

.toast--success .toast__icon {
  color: var(--primary-600);
}

.toast--error .toast__icon {
  color: var(--danger);
}

.toast__copy {
  min-width: 0;
}

.toast strong {
  display: block;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.4;
}

.toast p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.toast button {
  display: grid;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  place-items: center;
}

.toast button:hover {
  background: var(--surface-hover);
}

.toast button:focus-visible {
  outline: 3px solid rgb(22 163 74 / 20%);
  outline-offset: 1px;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
