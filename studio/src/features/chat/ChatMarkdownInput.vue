<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconAt, IconSparkles } from '@tabler/icons-vue';
import type { ChatMention, ChatParticipant } from './chat-types';
import { mentionQuery, prepareMentions, rebaseMentions } from './chat-mentions';
import { renderedChat } from './chat-markdown';
import { limitChatInput } from './chat-state';
import {
  editMarkdown,
  formatMarkdown,
  indentMarkdown,
  markdownCodeAt,
  markdownEnter,
  markdownTyping,
  normalizeMarkdown,
  type ChatDraft,
  type MarkdownAction,
  type MarkdownSelection,
} from './chat-markdown-input';
import { STORAGE_POLICY } from '@/core/privacy/storage';
import { ChatTypingEffects, type TypingEffectMode } from './chat-typing-effects';

const props = defineProps<{
  disabled: boolean;
  maxChars: number;
  maxBytes: number;
  selfId?: string;
  participants: ChatParticipant[];
  participantsLoading: boolean;
  participantsError: string;
}>();
const emit = defineEmits<{ change: [draft: ChatDraft]; send: []; participants: [] }>();
const root = ref<HTMLElement>();
const input = ref<HTMLTextAreaElement>();
const canvas = ref<HTMLCanvasElement>();
const effectsMenu = ref<HTMLDetailsElement>();
const source = ref('');
const mentions = ref<ChatMention[]>([]);
const caret = ref(0);
const selectionEnd = ref(0);
const feedback = ref('');
const active = ref(0);
const dismissed = ref(false);
const composing = ref(false);
const focused = ref(false);
const effectMode = ref<TypingEffectMode>('stars');
const reducedMotion = ref(false);
const EFFECT_KEY = `${STORAGE_POLICY.preferences}:chat-typing-effect`;
let effects: ChatTypingEffects | undefined;
let motionQuery: MediaQueryList | undefined;
let mirror: HTMLDivElement | undefined;
let compositionBefore: MarkdownSelection | undefined;
let compositionTimer: ReturnType<typeof setTimeout> | undefined;
let compositionFrame = 0;
let beforeInputValue: MarkdownSelection | undefined;
let alive = true;
const past: MarkdownSelection[] = [];
const future: MarkdownSelection[] = [];
let historyKind = '';
let historyAt = 0;
let lastAfter: MarkdownSelection | undefined;
const query = computed(() =>
  composing.value || caret.value !== selectionEnd.value || markdownCodeAt(source.value, caret.value)
    ? null
    : mentionQuery(source.value, caret.value, mentions.value),
);
const pickerOpen = computed(() => !!query.value && !dismissed.value && !props.disabled);
const candidates = computed(() =>
  props.participants
    .filter(
      (guest) =>
        guest.id !== props.selfId &&
        guest.nickname.toLocaleLowerCase().includes(query.value?.query.toLocaleLowerCase() ?? ''),
    )
    .slice(0, 8),
);

function snapshot(): MarkdownSelection {
  return {
    content: source.value,
    mentions: mentions.value.map((mention) => ({ ...mention })),
    start: input.value?.selectionStart ?? caret.value,
    end: input.value?.selectionEnd ?? selectionEnd.value,
  };
}
function current(): ChatDraft {
  const normalized = prepareMentions(source.value, mentions.value);
  const leading = source.value.length - source.value.trimStart().length;
  const adjusted = mentions.value
    .filter((mention) =>
      normalized.mentions.some(
        (item) => item.guestId === mention.guestId && item.start === mention.start - leading,
      ),
    )
    .map((mention) => ({ ...mention, start: mention.start - leading }));
  return {
    content: normalized.content,
    mentions: renderedChat(normalized.content, adjusted).mentions,
  };
}
function fits(value: MarkdownSelection) {
  return (
    limitChatInput(value.content, props.maxChars, props.maxBytes) === value.content &&
    value.mentions.length <= 10
  );
}
function resize() {
  const element = input.value;
  if (!element) return;
  const style = getComputedStyle(element);
  const minimum = Number.parseFloat(
    style.getPropertyValue(
      focused.value ? '--chat-input-focus-height' : '--chat-input-rest-height',
    ),
  );
  const maximum = Math.min(window.innerWidth <= 640 ? 180 : 240, window.innerHeight * 0.4);
  const height = element.getBoundingClientRect().height;
  const transition = element.style.transition;
  // 测量正文高度后恢复当前高度，再过渡到目标高度，避免 auto 高度造成跳动。
  element.style.transition = 'none';
  element.style.height = '0px';
  const contentHeight =
    element.scrollHeight +
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderBottomWidth);
  const target = Math.max(36, Math.min(maximum, Math.max(minimum, contentHeight)));
  element.style.height = `${height}px`;
  element.getBoundingClientRect();
  element.style.transition = transition;
  element.style.height = `${target}px`;
}
function focusInput() {
  focused.value = true;
  resize();
}
function record(before: MarkdownSelection, after: MarkdownSelection, kind: string) {
  const now = performance.now();
  const grouped =
    (kind === 'typing' || kind === 'delete') &&
    kind === historyKind &&
    now - historyAt < 700 &&
    before.start === before.end &&
    before.start === lastAfter?.start &&
    before.content === lastAfter?.content;
  if (!grouped) {
    past.push(before);
    if (past.length > 100) past.shift();
  }
  future.length = 0;
  historyKind = kind;
  historyAt = now;
  lastAfter = after;
}
function triggerContentEffect() {
  if (input.value) effects?.contentChanged(input.value.value);
}
function compositionUpdate() {
  // 部分浏览器先触发 compositionupdate，下一帧再读取实际 DOM 内容。
  if (compositionFrame) return;
  compositionFrame = requestAnimationFrame(() => {
    compositionFrame = 0;
    if (alive) triggerContentEffect();
  });
}
function commit(
  value: MarkdownSelection,
  before = snapshot(),
  kind = 'command',
  track = true,
  focus = true,
): boolean {
  if (props.disabled) return false;
  const normalized = normalizeMarkdown(value);
  if (!fits(normalized)) {
    feedback.value = '剩余字数不足或提及已达 10 次；Markdown 标记也计入字数。';
    restoreInput(before);
    return false;
  }
  if (
    track &&
    (normalized.content !== before.content ||
      JSON.stringify(normalized.mentions) !== JSON.stringify(before.mentions))
  )
    record(before, normalized, kind);
  source.value = normalized.content;
  mentions.value = normalized.mentions;
  caret.value = normalized.start;
  selectionEnd.value = normalized.end;
  dismissed.value = false;
  feedback.value = '';
  restoreInput(normalized, focus);
  emit('change', current());
  triggerContentEffect();
  void nextTick(resize);
  return true;
}
function restoreInput(value: MarkdownSelection, focus = false) {
  if (!input.value) return;
  input.value.value = value.content;
  input.value.setSelectionRange(value.start, value.end);
  if (focus) input.value.focus();
}
function syncSelection() {
  if (!input.value) return;
  caret.value = input.value.selectionStart;
  selectionEnd.value = input.value.selectionEnd;
}
function kindOf(event: Event) {
  return (event as InputEvent).inputType?.startsWith('delete') ? 'delete' : 'typing';
}
function updateInput(event: Event) {
  if (composing.value || (event as InputEvent).isComposing) {
    triggerContentEffect();
    return;
  }
  const element = event.target as HTMLTextAreaElement;
  const before = beforeInputValue ?? {
    content: source.value,
    mentions: mentions.value,
    start: caret.value,
    end: selectionEnd.value,
  };
  const raw = element.value;
  const limited = limitChatInput(raw, props.maxChars, props.maxBytes);
  if (limited !== raw.replaceAll('\r\n', '\n').normalize('NFC')) {
    let from = 0;
    while (from < source.value.length && from < raw.length && source.value[from] === raw[from])
      from++;
    let oldEnd = source.value.length;
    let newEnd = raw.length;
    while (oldEnd > from && newEnd > from && source.value[oldEnd - 1] === raw[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    insertText(
      raw.slice(from, newEnd),
      { ...before, start: from, end: oldEnd },
      kindOf(event),
      true,
    );
    beforeInputValue = undefined;
    return;
  }
  const position = limitChatInput(
    raw.slice(0, element.selectionStart),
    props.maxChars,
    props.maxBytes,
  ).length;
  const next = {
    content: limited,
    mentions: rebaseMentions(source.value, limited, mentions.value),
    start: position,
    end: position,
  };
  const kind = (event as InputEvent).inputType?.startsWith('delete') ? 'delete' : 'typing';
  commit(next, before, kind, true, false);
  beforeInputValue = undefined;
  if (raw !== limited) feedback.value = '已达到消息长度限制。';
}
function undo(redo = false) {
  const stack = redo ? future : past;
  const value = stack.pop();
  if (!value) return;
  (redo ? past : future).push(snapshot());
  historyKind = '';
  lastAfter = undefined;
  commit(value, snapshot(), 'history', false);
}
function beforeInput(event: InputEvent) {
  if (composing.value || event.isComposing) return;
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    undo(event.inputType === 'historyRedo');
    return;
  }
  beforeInputValue = snapshot();
  if (!event.inputType.startsWith('insert') || event.data === null) return;
  const before = beforeInputValue;
  const typing = markdownTyping(before, event.data);
  if (typing) {
    event.preventDefault();
    beforeInputValue = undefined;
    commit(typing, before);
    return;
  }
  const next = editMarkdown(
    before,
    [{ from: before.start, to: before.end, text: event.data }],
    before.start + event.data.length,
  );
  if (!fits(normalizeMarkdown(next))) {
    event.preventDefault();
    feedback.value = '已达到消息长度限制。';
    beforeInputValue = undefined;
  }
}
function insertText(text: string, before = snapshot(), kind = 'paste', truncate = false) {
  let inserted = text.replaceAll('\r\n', '\n').normalize('NFC');
  if (truncate) {
    let fit = '';
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      inserted,
    )) {
      const candidate = editMarkdown(
        before,
        [{ from: before.start, to: before.end, text: fit + segment }],
        before.start + fit.length + segment.length,
      );
      if (!fits(normalizeMarkdown(candidate))) break;
      fit += segment;
    }
    inserted = fit;
  }
  const next = editMarkdown(
    before,
    [{ from: before.start, to: before.end, text: inserted }],
    before.start + inserted.length,
  );
  const changed = commit(next, before, kind);
  if (truncate && inserted !== text.replaceAll('\r\n', '\n').normalize('NFC'))
    feedback.value = '仅插入剩余字数可容纳的内容，已有正文已保留。';
  return changed && !!inserted;
}
function paste(event: ClipboardEvent) {
  if (!event.clipboardData || composing.value) return;
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain');
  if (text) insertText(text, snapshot(), 'paste', true);
}
function compositionStart() {
  composing.value = true;
  compositionBefore = snapshot();
}
function compositionEnd(event: CompositionEvent) {
  const text = event.data;
  clearTimeout(compositionTimer);
  compositionTimer = setTimeout(() => {
    if (!alive) return;
    composing.value = false;
    if (compositionBefore && text) {
      insertText(text, compositionBefore, 'composition', true);
    } else if (input.value) updateInput({ target: input.value } as unknown as Event);
    compositionBefore = undefined;
    beforeInputValue = undefined;
  }, 0);
}
async function focus() {
  await nextTick();
  input.value?.focus();
  resize();
}
function format(action: MarkdownAction) {
  if (props.disabled || composing.value) return;
  const before = snapshot();
  commit(formatMarkdown(before, action), before);
}
function selectMention(guest: ChatParticipant) {
  if (props.disabled || guest.id === props.selfId) return;
  if (markdownCodeAt(source.value, caret.value)) {
    feedback.value = '代码中不创建提及。';
    return;
  }
  const before = snapshot();
  const trigger = query.value;
  const from = trigger?.start ?? before.start;
  const to = trigger ? caret.value : before.end;
  const separator = from > 0 && !/\s/.test(source.value[from - 1]!) ? ' ' : '';
  const token = '@' + guest.nickname;
  const text = separator + token + ' ';
  const next = editMarkdown(before, [{ from, to, text }], from + text.length);
  next.mentions.push({
    guestId: guest.id,
    nickname: guest.nickname,
    start: from + separator.length,
    length: token.length,
  });
  if (commit(next, before)) {
    dismissed.value = true;
    void focus();
  }
}
function insertAt() {
  if (props.disabled) return;
  const before = snapshot();
  const prefix = before.start > 0 && !/\s/.test(before.content[before.start - 1]!) ? ' @' : '@';
  insertText(prefix, before, 'command');
  void focus();
}
function keydown(event: KeyboardEvent) {
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  if (pickerOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissed.value = true;
      return;
    }
    if (candidates.value.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      active.value =
        (active.value + (event.key === 'ArrowUp' ? candidates.value.length - 1 : 1)) %
        candidates.value.length;
      return;
    }
    if (candidates.value.length && !event.shiftKey && ['Enter', 'Tab'].includes(event.key)) {
      event.preventDefault();
      selectMention(candidates.value[Math.min(active.value, candidates.value.length - 1)]!);
      return;
    }
  }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && ['b', 'i', 'k', 'e'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    format(
      ({ b: 'bold', i: 'italic', k: 'link', e: 'code' } as const)[event.key.toLowerCase() as 'b'],
    );
    return;
  }
  if (mod && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
    event.preventDefault();
    undo(event.shiftKey || event.key.toLowerCase() === 'y');
    return;
  }
  if (
    event.key === 'Tab' &&
    (snapshot().start !== snapshot().end ||
      markdownCodeAt(source.value, caret.value) ||
      /^\s*(?:[-+*]|\d+[.)]) /.test(
        source.value.slice(source.value.lastIndexOf('\n', caret.value - 1) + 1, caret.value),
      ))
  ) {
    event.preventDefault();
    const before = snapshot();
    commit(indentMarkdown(before, event.shiftKey), before);
    return;
  }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (mod) {
    emit('send');
    return;
  }
  const before = snapshot();
  const next = markdownEnter(before, event.shiftKey);
  if (next) commit(next, before);
  else emit('send');
}
function closeEffects() {
  if (effectsMenu.value) effectsMenu.value.open = false;
}
function changeEffect() {
  effects?.setMode(effectMode.value);
  try {
    localStorage.setItem(EFFECT_KEY, effectMode.value);
  } catch {
    /* 偏好不可写时只在本页生效。 */
  }
}
function syncMotion() {
  reducedMotion.value = motionQuery?.matches ?? false;
}
function outside(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (effectsMenu.value && !effectsMenu.value.contains(target)) effectsMenu.value.open = false;
  if (!root.value?.contains(target)) dismissed.value = true;
}
function blur(event: FocusEvent) {
  focused.value = false;
  resize();
  effects?.clear();
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    dismissed.value = true;
}
function measureCaret() {
  const element = input.value;
  if (!element || !mirror || document.activeElement !== element) return null;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  for (const name of [
    'box-sizing',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-style',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'tab-size',
    'text-indent',
    'direction',
  ])
    mirror.style.setProperty(name, style.getPropertyValue(name));
  mirror.style.width = `${rect.width}px`;
  mirror.textContent = element.value.slice(0, element.selectionEnd);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  const mark = marker.getBoundingClientRect();
  const box = mirror.getBoundingClientRect();
  const x = rect.left + mark.left - box.left - element.scrollLeft;
  const y = rect.top + mark.top - box.top - element.scrollTop + 8;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom ? { x, y } : null;
}
watch([pickerOpen, () => query.value?.query], () => {
  active.value = 0;
  if (pickerOpen.value) emit('participants');
});
watch(active, async (index) => {
  await nextTick();
  root.value?.querySelector(`#chat-mention-option-${index}`)?.scrollIntoView({ block: 'nearest' });
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      effects?.clear();
      dismissed.value = true;
    }
  },
);
onMounted(() => {
  try {
    const saved = localStorage.getItem(EFFECT_KEY);
    if (saved && ['off', 'stars', 'rainbow', 'fireworks'].includes(saved))
      effectMode.value = saved as TypingEffectMode;
  } catch {
    /* 无法读取时使用默认星光。 */
  }
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncMotion();
  motionQuery.addEventListener('change', syncMotion);
  mirror = document.createElement('div');
  mirror.className = 'chat-caret-mirror';
  document.body.append(mirror);
  if (canvas.value) {
    effects = new ChatTypingEffects(canvas.value, measureCaret);
    effects.setMode(effectMode.value);
  }
  document.addEventListener('pointerdown', outside);
  window.addEventListener('resize', resize);
  resize();
});
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(compositionTimer);
  cancelAnimationFrame(compositionFrame);
  effects?.destroy();
  motionQuery?.removeEventListener('change', syncMotion);
  mirror?.remove();
  document.removeEventListener('pointerdown', outside);
  window.removeEventListener('resize', resize);
});
function clear() {
  source.value = '';
  mentions.value = [];
  caret.value = 0;
  selectionEnd.value = 0;
  past.length = 0;
  future.length = 0;
  historyKind = '';
  lastAfter = undefined;
  feedback.value = '';
  dismissed.value = true;
  restoreInput({ content: '', mentions: [], start: 0, end: 0 });
  emit('change', current());
  triggerContentEffect();
  void nextTick(resize);
}
defineExpose({ focus, clear, insertMention: selectMention, insertAt, current });
</script>
<template>
  <div ref="root" class="chat-markdown-input">
    <canvas ref="canvas" class="chat-typing-canvas" aria-hidden="true"></canvas>
    <details
      ref="effectsMenu"
      class="chat-effects-settings"
      @keydown.esc.prevent.stop="closeEffects"
    >
      <summary aria-label="打字特效设置" title="打字特效"><IconSparkles :size="15" /></summary>
      <div class="chat-effects-panel">
        <label
          >打字特效<select v-model="effectMode" aria-label="打字特效" @change="changeEffect">
            <option value="off">关闭</option>
            <option value="stars">彩虹星光</option>
            <option value="rainbow">彩虹粒子</option>
            <option value="fireworks">烟花</option>
          </select></label
        ><small v-if="reducedMotion">系统已减少动态效果，特效已暂停。</small>
      </div>
    </details>
    <div class="chat-input-field">
      <div v-if="pickerOpen" class="chat-mention-picker" @pointerdown.prevent>
        <div class="chat-mention-heading">选择要提及的访客<span>↑↓ 选择 · Enter 确认</span></div>
        <div id="chat-mention-options" role="listbox" aria-label="提及访客">
          <button
            v-for="(guest, index) in candidates"
            :id="`chat-mention-option-${index}`"
            :key="guest.id"
            type="button"
            role="option"
            :aria-selected="active === index"
            :class="{ 'is-active': active === index }"
            @click="selectMention(guest)"
          >
            <IconAt :size="16" /><span class="chat-mention-name"
              >{{ guest.nickname
              }}<small
                v-if="candidates.filter((item) => item.nickname === guest.nickname).length > 1"
              >
                · {{ guest.id.slice(0, 6) }}</small
              ></span
            ><span class="chat-mention-presence">{{ guest.online ? '在线' : '近期发言' }}</span>
          </button>
        </div>
        <p v-if="!candidates.length">
          {{ participantsLoading ? '正在获取访客…' : '没有匹配的访客' }}
        </p>
        <button
          v-if="participantsError"
          type="button"
          class="chat-mention-retry"
          @click="emit('participants')"
        >
          {{ participantsError }} 点击重试
        </button>
      </div>

      <textarea
        id="chat-message-input"
        ref="input"
        :value="source"
        :disabled="disabled"
        rows="1"
        aria-label="消息正文"
        placeholder="说点什么吧..."
        aria-describedby="chat-input-help"
        :aria-expanded="pickerOpen"
        :aria-controls="pickerOpen ? 'chat-mention-options' : undefined"
        :aria-activedescendant="
          pickerOpen && candidates.length
            ? `chat-mention-option-${Math.min(active, candidates.length - 1)}`
            : undefined
        "
        @beforeinput="beforeInput"
        @input="updateInput"
        @paste="paste"
        @compositionstart="compositionStart"
        @compositionupdate="compositionUpdate"
        @compositionend="compositionEnd"
        @keydown="keydown"
        @focus="focusInput"
        @click="syncSelection"
        @keyup="syncSelection"
        @select="syncSelection"
        @blur="blur"
      ></textarea>
    </div>
    <p v-if="feedback" class="chat-editor-feedback" role="status">{{ feedback }}</p>
  </div>
</template>
