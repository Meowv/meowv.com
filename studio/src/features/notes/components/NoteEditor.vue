<script setup lang="ts">
import { ref } from 'vue';
import { NOTE_TEXT_ACTIONS, type NoteTextStyleAction } from '@/features/notes/lib/text-style';
import { compressPastedImage, formatNoteBytes } from '@/features/notes/lib/compress-image';

defineProps<{ modelValue: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const processing = ref(false);
const status = ref<{ tone: 'ok' | 'error'; text: string } | null>(null);
let statusTimer: number | null = null;

function showStatus(tone: 'ok' | 'error', text: string): void {
  if (statusTimer !== null) window.clearTimeout(statusTimer);
  status.value = { tone, text };
  statusTimer = window.setTimeout(() => {
    status.value = null;
  }, 4000);
}

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

async function onPaste(event: ClipboardEvent): Promise<void> {
  const items = Array.from(event.clipboardData?.items ?? []);
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  if (processing.value) return;

  const imageBlob = imageItem.getAsFile();
  if (!imageBlob) return;
  processing.value = true;
  showStatus('ok', '正在插入图片…');
  try {
    const compressed = await compressPastedImage(imageBlob);
    insertImage(compressed.dataUrl);
    showStatus('ok', `已插入图片（${formatNoteBytes(compressed.bytes)}）`);
  } catch (error) {
    showStatus('error', error instanceof Error ? error.message : '图片插入失败。');
  } finally {
    processing.value = false;
  }
}

function insertImage(dataUrl: string): void {
  const textarea = textareaRef.value;
  if (!textarea) return;
  const before = textarea.value.slice(0, textarea.selectionStart);
  const after = textarea.value.slice(textarea.selectionEnd);
  const needLeadingBreak = before.length > 0 && !before.endsWith('\n');
  const trailingBreak = after.length > 0 && !after.startsWith('\n');
  const wrapped = `${needLeadingBreak ? '\n' : ''}![](${dataUrl})${trailingBreak ? '\n' : ''}`;
  const next = `${before}${wrapped}${after}`;
  const cursor = before.length + wrapped.length;
  emit('update:modelValue', next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
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
      <span
        v-if="status"
        class="note-editor__status"
        :class="{ 'note-editor__status--error': status.tone === 'error' }"
        role="status"
      >
        {{ status.text }}
      </span>
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
      @paste="onPaste"
    ></textarea>
  </div>
</template>
