<script setup lang="ts">
import { AlertTriangle, X } from "@lucide/vue";
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    dangerous?: boolean;
    requiredText?: string;
    inputLabel?: string;
    inputPlaceholder?: string;
    inputValue?: string;
    requireNonEmpty?: boolean;
  }>(),
  {
    description: "",
    confirmLabel: "确认",
    cancelLabel: "取消",
    dangerous: false,
    requiredText: "",
    inputLabel: "",
    inputPlaceholder: "",
    inputValue: "",
    requireNonEmpty: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  confirm: [];
  "update:inputValue": [value: string];
  "update:open": [value: boolean];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const dialogInput = ref("");
let previousFocus: HTMLElement | null = null;

const close = () => {
  emit("update:open", false);
  emit("cancel");
};

const confirm = () => {
  if (
    (props.requiredText && dialogInput.value !== props.requiredText) ||
    (props.requireNonEmpty && !dialogInput.value.trim())
  ) {
    return;
  }
  emit("confirm");
};

const onKeydown = (event: KeyboardEvent) => {
  if (!props.open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }

  if (event.key !== "Tab" || !dialogRef.value) return;
  const focusable = Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialogInput.value = props.inputValue;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      (props.requiredText || props.inputLabel
        ? inputRef.value
        : dialogRef.value?.querySelector<HTMLElement>("button")
      )?.focus();
    } else {
      document.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
      previousFocus = null;
    }
  },
);

onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="open" class="dialog-backdrop" @mousedown.self="close">
        <section
          ref="dialogRef"
          class="dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <button class="dialog__close" type="button" aria-label="关闭" @click="close">
            <X :size="18" />
          </button>
          <span v-if="dangerous" class="dialog__alert" aria-hidden="true">
            <AlertTriangle :size="22" :stroke-width="1.8" />
          </span>
          <h2 id="confirm-dialog-title">{{ title }}</h2>
          <p v-if="description" id="confirm-dialog-description">{{ description }}</p>
          <label v-if="requiredText || inputLabel" class="dialog__field">
            <span>{{ inputLabel || `请输入“${requiredText}”以继续` }}</span>
            <input
              ref="inputRef"
              v-model="dialogInput"
              type="text"
              autocomplete="off"
              :placeholder="inputPlaceholder || requiredText"
              @input="$emit('update:inputValue', dialogInput)"
              @keydown.enter="confirm"
            />
          </label>
          <div class="dialog__actions">
            <button class="button button--secondary" type="button" @click="close">
              {{ cancelLabel }}
            </button>
            <button
              class="button"
              :class="{ 'button--danger': dangerous }"
              type="button"
              :disabled="
                (Boolean(requiredText) && dialogInput !== requiredText) ||
                (requireNonEmpty && !dialogInput.trim())
              "
              @click="confirm"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: var(--backdrop);
}

.dialog {
  position: relative;
  width: min(440px, 100%);
  padding: 26px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 16px 48px rgb(21 35 27 / 14%);
}

.dialog__close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  place-items: center;
}

.dialog__close:hover {
  background: var(--surface-hover);
}

.dialog__alert {
  display: grid;
  width: 38px;
  height: 38px;
  margin-bottom: 14px;
  border-radius: 7px;
  background: var(--danger-surface);
  color: var(--danger);
  place-items: center;
}

.dialog h2 {
  margin: 0;
  padding-right: 30px;
  color: var(--text-strong);
  font-size: 19px;
  font-weight: 680;
  line-height: 1.45;
}

.dialog p {
  margin: 9px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.dialog__field {
  display: grid;
  gap: 7px;
  margin-top: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.dialog__field input {
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  color: var(--text-strong);
  font: inherit;
  outline: none;
}

.dialog__field input:focus {
  border-color: var(--primary-600);
  box-shadow: 0 0 0 3px rgb(22 163 74 / 13%);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.button {
  min-width: 88px;
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--primary-600);
  border-radius: 6px;
  background: var(--primary-600);
  color: var(--on-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.button:hover {
  border-color: var(--primary-700);
  background: var(--primary-700);
}

.button:focus-visible,
.dialog__close:focus-visible {
  outline: 3px solid rgb(22 163 74 / 20%);
  outline-offset: 2px;
}

.button:disabled {
  border-color: var(--border-emphasis);
  background: var(--border-emphasis);
  cursor: not-allowed;
}

.button--secondary {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

.button--secondary:hover {
  border-color: var(--border-emphasis);
  background: var(--app-bg);
}

.button--danger {
  border-color: var(--danger);
  background: var(--danger);
}

.button--danger:hover {
  border-color: var(--danger-text);
  background: var(--danger-text);
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 160ms ease;
}

.dialog-fade-enter-active .dialog,
.dialog-fade-leave-active .dialog {
  transition: transform 160ms ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .dialog,
.dialog-fade-leave-to .dialog {
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .dialog-fade-enter-active,
  .dialog-fade-leave-active,
  .dialog-fade-enter-active .dialog,
  .dialog-fade-leave-active .dialog {
    transition: none;
  }
}
</style>
