<script setup lang="ts">
import { X } from "@lucide/vue";
import { onBeforeUnmount, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    width?: string;
  }>(),
  {
    description: "",
    width: "560px",
  },
);

const emit = defineEmits<{
  close: [];
}>();

function handleKeydown(event: KeyboardEvent) {
  if (props.open && event.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (open) => {
    if (open) document.addEventListener("keydown", handleKeydown);
    else document.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="editor-dialog">
      <div v-if="open" class="editor-dialog__backdrop" @mousedown.self="$emit('close')">
        <section
          class="editor-dialog"
          :style="{ '--dialog-width': width }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header>
            <div>
              <h2>{{ title }}</h2>
              <p v-if="description">{{ description }}</p>
            </div>
            <button type="button" aria-label="关闭" @click="$emit('close')">
              <X :size="19" />
            </button>
          </header>
          <div class="editor-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.editor-dialog__backdrop {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: grid;
  padding: 24px;
  background: var(--backdrop);
  place-items: center;
}

.editor-dialog {
  display: flex;
  width: min(var(--dialog-width), 100%);
  max-height: min(760px, calc(100dvh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 22px 64px rgb(19 31 23 / 20%);
}

.editor-dialog > header {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border);
}

.editor-dialog h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 680;
}

.editor-dialog header p {
  margin: 5px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1.55;
}

.editor-dialog header button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  place-items: center;
}

.editor-dialog header button:hover {
  background: var(--surface-hover);
}

.editor-dialog__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 20px 22px;
}

.editor-dialog > footer {
  display: flex;
  flex: none;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
  background: var(--surface-subtle);
}

.editor-dialog-enter-active,
.editor-dialog-leave-active {
  transition: opacity 160ms ease;
}

.editor-dialog-enter-active .editor-dialog,
.editor-dialog-leave-active .editor-dialog {
  transition: transform 160ms ease;
}

.editor-dialog-enter-from,
.editor-dialog-leave-to {
  opacity: 0;
}

.editor-dialog-enter-from .editor-dialog,
.editor-dialog-leave-to .editor-dialog {
  transform: translateY(8px) scale(0.99);
}
</style>
