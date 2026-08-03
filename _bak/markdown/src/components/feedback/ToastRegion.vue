<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
} from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

function runAction(toast: (typeof store.toasts)[number]): void {
  store.dismissToast(toast.id);
  toast.action?.run();
}
</script>

<template>
  <div
    class="toast-region"
    role="region"
    aria-label="应用通知"
    aria-live="polite"
    aria-relevant="additions text"
  >
    <article
      v-for="toast in store.toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.kind}`"
      :role="toast.kind === 'error' ? 'alert' : 'status'"
      aria-atomic="true"
    >
      <CheckCircle2
        v-if="toast.kind === 'success'"
        :size="18"
        class="mt-0.5 shrink-0 text-[var(--color-success)]"
        aria-hidden="true"
      />
      <AlertCircle
        v-else-if="toast.kind === 'error'"
        :size="18"
        class="mt-0.5 shrink-0 text-[var(--color-danger)]"
        aria-hidden="true"
      />
      <Info
        v-else
        :size="18"
        class="mt-0.5 shrink-0 text-[var(--color-brand)]"
        aria-hidden="true"
      />

      <div class="toast__copy">
        <strong>{{ toast.title }}</strong>
        <p v-if="toast.message">{{ toast.message }}</p>
      </div>

      <button
        v-if="toast.action"
        class="toast__action"
        type="button"
        @click="runAction(toast)"
      >
        {{ toast.action.label }}
      </button>

      <button
        class="icon-button !h-7 !w-7 !basis-7"
        type="button"
        :aria-label="`关闭通知：${toast.title}`"
        @click="store.dismissToast(toast.id)"
      >
        <X :size="16" aria-hidden="true" />
      </button>
    </article>
  </div>
</template>
