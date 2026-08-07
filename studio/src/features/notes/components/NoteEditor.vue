<script setup lang="ts">
import { ref } from 'vue';
import { NOTE_TEXT_ACTIONS, type NoteTextStyleAction } from '@/features/notes/lib/text-style';

defineProps<{ modelValue: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function applyAction(action: (typeof NOTE_TEXT_ACTIONS)[number]): void {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const next = action.apply(textarea.value, textarea.selectionStart, textarea.selectionEnd);
  emit('update:modelValue', next.text);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
  });
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  const action = NOTE_TEXT_ACTIONS.find(
    (item) =>
      item.shortcut && item.shortcut.key === key && !!item.shortcut.shift === event.shiftKey,
  );
  if (!action) return;
  event.preventDefault();
  applyAction(action);
}

function actionTitle(action: NoteTextStyleAction): string {
  if (!action.shortcut) return action.title;
  const prefix = action.shortcut.shift ? 'Ctrl/⌘+Shift+' : 'Ctrl/⌘+';
  return `${action.title}（${prefix}${action.shortcut.key.toUpperCase()}）`;
}
</script>

<template>
  <div class="note-editor">
    <div class="note-editor__toolbar" aria-label="文字样式">
      <button
        v-for="action in NOTE_TEXT_ACTIONS"
        :key="action.title"
        class="note-editor__tool"
        type="button"
        :title="actionTitle(action)"
        :aria-label="action.title"
        @mousedown.prevent
        @click="applyAction(action)"
      >
        {{ action.label }}
      </button>
    </div>
    <textarea
      ref="textareaRef"
      class="note-editor__textarea"
      :value="modelValue"
      :spellcheck="false"
      placeholder="记录灵感，支持 Markdown 语法…"
      aria-label="便签内容（支持 Markdown）"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>
  </div>
</template>
