<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IconArrowDown,
  IconArrowUp,
  IconLogout,
  IconMessageCircle,
  IconRefresh,
  IconSend,
  IconShieldLock,
  IconX,
  IconCornerUpLeft,
  IconTrash,
  IconTrashX,
  IconAt,
} from '@tabler/icons-vue';
import {
  characterCount,
  quoteMessage,
  limitChatInput,
  validContent,
  validNickname,
} from './chat-state';
import { useChat } from './useChat';
import { mentionParts, mentionQuery, prepareMentions, rebaseMentions } from './chat-mentions';
import { generateChatNickname } from './chat-nickname';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ChatAdminDialogs from './ChatAdminDialogs.vue';
import { useChatAdmin } from './useChatAdmin';
import type { ChatMessage, ChatReply, ChatMention, ChatParticipant } from './chat-types';
import './chat.css';

const chat = useChat();
const admin = useChatAdmin();
const { active: adminActive } = admin;
const adminDialogs = ref<InstanceType<typeof ChatAdminDialogs> | null>(null);
function openAdmin() {
  if (adminActive.value) {
    admin.clear();
  } else void adminDialogs.value?.openLogin();
}
function manageMessage(message: ChatMessage, permanent = false) {
  void adminDialogs.value?.openDelete(message, permanent);
}
const { store, initializing, joining, sending, leaving } = chat;
const identityMenu = ref<HTMLDetailsElement | null>(null);
function dismissIdentityMenu(event: PointerEvent | FocusEvent) {
  if (event.target instanceof Node && !identityMenu.value?.contains(event.target)) {
    if (identityMenu.value) identityMenu.value.open = false;
  }
}
function closeIdentityMenu() {
  if (!identityMenu.value?.open) return;
  identityMenu.value.open = false;
  identityMenu.value.querySelector('summary')?.focus();
}
const selectedReply = ref<ChatMessage | null>(null);
const replyPreview = computed<ChatReply | null>(() => {
  if (!selectedReply.value) return null;
  const id = selectedReply.value.id;
  const message = store.messages.find((item) => item.id === id) ?? selectedReply.value;
  const reply = quoteMessage(message);
  if (store.purgedIds[id]) return { ...reply, content: '', nickname: '', unavailable: true };
  if ((store.deletedIds[id] ?? -1) >= reply.revision)
    return { ...reply, content: '', deleted: true };
  return reply;
});
const highlightedId = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
function replyTo(message: ChatMessage) {
  if (message.guestId === store.session?.guest.id) return;
  selectedReply.value = message;
  composer.value?.focus();
}
async function locateReply(reply: ChatReply) {
  if (reply.unavailable || store.loadingHistory) return;
  restoringScroll = true;
  try {
    if (!(await chat.focus(reply.id))) return;
    await nextTick();
    const element = list.value?.querySelector<HTMLElement>(`[data-message-id="${reply.id}"]`);
    element?.scrollIntoView({ block: 'center', behavior: 'instant' });
    highlightedId.value = reply.id;
    nearBottom.value = false;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedId.value = null;
    }, 2000);
  } finally {
    restoringScroll = false;
  }
}
async function loadNewer() {
  restoringScroll = true;
  try {
    await chat.newer();
  } finally {
    restoringScroll = false;
  }
}
async function backToLatest() {
  restoringScroll = true;
  try {
    if (await chat.latest()) await bottom();
  } finally {
    restoringScroll = false;
  }
}
const quoteLabel = (reply: ChatReply) =>
  reply.unavailable ? '原消息已不可用' : reply.deleted ? '此消息已被移除' : reply.content;
const nickname = ref(generateChatNickname());
const draft = ref('');
const list = ref<HTMLElement | null>(null);
const composer = ref<HTMLTextAreaElement | null>(null);
const draftMentions = ref<ChatMention[]>([]);
const mentionCaret = ref(0);
const mentionActive = ref(0);
const mentionDismissed = ref(false);
const mentionComposing = ref(false);
const mentionFeedback = ref('');
const mentionTrigger = computed(() =>
  mentionComposing.value
    ? null
    : mentionQuery(draft.value, mentionCaret.value, draftMentions.value),
);
const mentionOpen = computed(
  () => !!mentionTrigger.value && !mentionDismissed.value && !sending.value,
);
const mentionCandidates = computed(() => {
  const guests = new Map<string, ChatParticipant>();
  for (const participant of chat.participants.value) guests.set(participant.id, participant);
  for (const message of [...store.messages].reverse())
    if (!message.deleted && !guests.has(message.guestId))
      guests.set(message.guestId, {
        id: message.guestId,
        nickname: message.nickname,
        avatarSeed: message.avatarSeed,
        online: false,
      });
  const query = (mentionTrigger.value?.query ?? '').toLocaleLowerCase();
  return [...guests.values()]
    .filter(
      (guest) =>
        guest.id !== store.session?.guest.id && guest.nickname.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8);
});
watch([mentionOpen, () => mentionTrigger.value?.query], () => {
  mentionActive.value = 0;
  if (mentionOpen.value) void chat.loadParticipants();
});
watch(mentionCandidates, (candidates) => {
  mentionActive.value = Math.min(mentionActive.value, Math.max(0, candidates.length - 1));
});
watch(mentionActive, async (index) => {
  await nextTick();
  document.getElementById(`chat-mention-option-${index}`)?.scrollIntoView({ block: 'nearest' });
});
function blurMentionPicker(event: FocusEvent) {
  if (
    !(event.relatedTarget instanceof Element) ||
    !event.relatedTarget.closest('.chat-mention-picker')
  )
    mentionDismissed.value = true;
}
function setDraft(value: string) {
  draftMentions.value = rebaseMentions(draft.value, value, draftMentions.value);
  draft.value = value;
  mentionDismissed.value = false;
  mentionFeedback.value = '';
}
function syncMentionCaret() {
  mentionCaret.value = composer.value?.selectionStart ?? 0;
}
async function insertMention(participant: ChatParticipant) {
  if (participant.id === store.session?.guest.id || !composer.value) return;
  const element = composer.value;
  const trigger = mentionTrigger.value;
  const start = trigger?.start ?? element.selectionStart;
  const end = trigger ? mentionCaret.value : element.selectionEnd;
  const before = draft.value.slice(0, start);
  const separator = before && !/\s$/.test(before) ? ' ' : '';
  const token = '@' + participant.nickname;
  const inserted = separator + token + ' ';
  const value = before + inserted + draft.value.slice(end);
  if (
    rebaseMentions(draft.value, value, draftMentions.value).length >= 10 ||
    limitDraft(value) !== value
  ) {
    mentionFeedback.value = '剩余字数不足或提及已达 10 次。';
    return;
  }
  setDraft(value);
  draftMentions.value.push({
    guestId: participant.id,
    nickname: participant.nickname,
    start: start + separator.length,
    length: token.length,
  });
  mentionDismissed.value = true;
  await nextTick();
  element.focus();
  element.setSelectionRange(start + inserted.length, start + inserted.length);
  syncMentionCaret();
}
async function insertAt() {
  const element = composer.value;
  if (!element) return;
  const start = element.selectionStart;
  const before = draft.value.slice(0, start);
  const inserted = before && !/\s$/.test(before) ? ' @' : '@';
  const value = before + inserted + draft.value.slice(element.selectionEnd);
  if (limitDraft(value) !== value) return;
  setDraft(value);
  await nextTick();
  element.focus();
  element.setSelectionRange(start + inserted.length, start + inserted.length);
  syncMentionCaret();
}
const isMentioned = (message: ChatMessage) =>
  !message.deleted &&
  message.guestId !== store.session?.guest.id &&
  message.mentions?.some((mention) => mention.guestId === store.session?.guest.id);
const messageParts = (message: ChatMessage) =>
  mentionParts(message.content, message.mentions ?? []);
function acknowledgeMentions() {
  if (document.visibilityState !== 'visible' || !list.value) return;
  const area = list.value.getBoundingClientRect();
  chat.mentionIds.value = chat.mentionIds.value.filter((id) => {
    const element = list.value?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!element) return true;
    const bounds = element.getBoundingClientRect();
    return bounds.bottom <= area.top || bounds.top >= area.bottom;
  });
}
watch(
  () => chat.mentionIds.value.join(','),
  async () => {
    await nextTick();
    acknowledgeMentions();
  },
);
async function jumpToMention() {
  const id = chat.mentionIds.value[0];
  if (!id) return;
  await locateReply({
    id,
    nickname: '',
    content: '',
    deleted: false,
    unavailable: false,
    revision: 0,
  });
  acknowledgeMentions();
  chat.mentionIds.value = chat.mentionIds.value.filter((item) => item !== id);
}
const joinDialog = ref<HTMLDialogElement | null>(null);
const nicknameInput = ref<HTMLInputElement | null>(null);
const nearBottom = ref(true);
const newMessages = ref(0);
const viewportHeight = ref('100dvh');
let restoringScroll = false;
let mounted = true;
const statusText = computed(
  () =>
    ({
      idle: '尚未加入',
      connecting: '正在连接',
      connected: '实时连接',
      reconnecting: '正在重连',
      disconnected: '连接已断开',
    })[store.connectionStatus],
);
const count = computed(() => characterCount(draft.value.normalize('NFC')));
let composing = false;
let compositionSelection = { before: '', after: '' };
const contentValid = computed(() =>
  validContent(draft.value, store.maxMessageChars, store.maxMessageBytes),
);
const canSend = computed(
  () =>
    contentValid.value &&
    store.connectionStatus === 'connected' &&
    !sending.value &&
    !replyPreview.value?.deleted &&
    !replyPreview.value?.unavailable,
);
const failed = computed(() => Object.values(store.pendingMessages).includes('failed'));
const unavailable = computed(() => !store.session && store.unavailable);
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(value));
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function avatarColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 38% 43%)`;
}
async function bottom() {
  await nextTick();
  if (!mounted || !list.value) return;
  list.value.scrollTop = list.value.scrollHeight;
  nearBottom.value = true;
  newMessages.value = 0;
  acknowledgeMentions();
}
async function loadOlder() {
  const element = list.value;
  if (!element || store.loadingHistory || !store.hasMoreHistory) return;
  const height = element.scrollHeight;
  const top = element.scrollTop;
  restoringScroll = true;
  try {
    await chat.older();
    await nextTick();
    if (mounted && list.value === element) element.scrollTop = top + element.scrollHeight - height;
  } finally {
    restoringScroll = false;
  }
}
function scroll() {
  const element = list.value;
  if (!element || restoringScroll) return;
  nearBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  if (nearBottom.value) newMessages.value = 0;
  acknowledgeMentions();
  if (element.scrollTop < 40) void loadOlder();
}
watch(
  () => store.messages.at(-1)?.id,
  (id, previous) => {
    if (!id || id === previous || restoringScroll) return;
    if (nearBottom.value && !restoringScroll) void bottom();
    else newMessages.value++;
  },
);
watch([initializing, () => store.session, unavailable], async () => {
  await nextTick();
  if (!mounted) return;
  if (!initializing.value && !store.session && !unavailable.value) {
    if (!joinDialog.value?.open) joinDialog.value?.showModal();
    nicknameInput.value?.focus();
    nicknameInput.value?.select();
  } else joinDialog.value?.close();
});
watch(
  () => !!replyPreview.value,
  () => {
    if (nearBottom.value) void bottom();
  },
);
function shuffleNickname() {
  nickname.value = generateChatNickname(nickname.value);
  nicknameInput.value?.focus();
  nicknameInput.value?.select();
}
async function join() {
  if (!validNickname(nickname.value)) return;
  await chat.join(nickname.value);
  if (store.session) {
    await bottom();
    composer.value?.focus();
  }
}
async function send() {
  if (!canSend.value) return;
  const content = draft.value;
  const reply = selectedReply.value;
  const mentionSnapshot = JSON.stringify(draftMentions.value);
  const prepared = prepareMentions(content, draftMentions.value);
  if (await chat.send(prepared.content, reply?.id ?? null, prepared.mentions)) {
    if (selectedReply.value === reply) selectedReply.value = null;
    if (draft.value === content && JSON.stringify(draftMentions.value) === mentionSnapshot)
      setDraft('');
    await bottom();
    composer.value?.focus();
  }
}
function limitDraft(value: string): string {
  return limitChatInput(value, store.maxMessageChars, store.maxMessageBytes);
}
function updateDraft(element: HTMLTextAreaElement) {
  const position = element.selectionStart;
  const limited = limitDraft(element.value);
  if (element.value !== limited) {
    const caret = limitDraft(element.value.slice(0, position)).length;
    element.value = limited;
    element.setSelectionRange(caret, caret);
  }
  setDraft(limited);
  mentionCaret.value = element.selectionStart;
}
function input(event: Event) {
  if (!composing && !(event as InputEvent).isComposing)
    updateDraft(event.target as HTMLTextAreaElement);
}
function compositionStart(event: CompositionEvent) {
  composing = true;
  mentionComposing.value = true;
  const element = event.target as HTMLTextAreaElement;
  compositionSelection = {
    before: element.value.slice(0, element.selectionStart),
    after: element.value.slice(element.selectionEnd),
  };
}
function compositionEnd(event: CompositionEvent) {
  composing = false;
  mentionComposing.value = false;
  const element = event.target as HTMLTextAreaElement;
  if (event.data) {
    insertDraft(element, compositionSelection.before, event.data, compositionSelection.after);
  } else updateDraft(element);
}
function beforeInput(event: InputEvent) {
  if (composing || event.isComposing || !event.inputType.startsWith('insert')) return;
  const element = event.target as HTMLTextAreaElement;
  const inserted = event.data ?? (event.inputType === 'insertLineBreak' ? '\n' : null);
  if (inserted === null) return;
  const value =
    element.value.slice(0, element.selectionStart) +
    inserted +
    element.value.slice(element.selectionEnd);
  if (limitDraft(value) !== value.replaceAll('\r\n', '\n').normalize('NFC')) event.preventDefault();
}
function paste(event: ClipboardEvent) {
  if (!event.clipboardData || composing) return;
  const text = event.clipboardData.getData('text/plain');
  if (!text) return;
  event.preventDefault();
  const element = event.target as HTMLTextAreaElement;
  insertDraft(
    element,
    element.value.slice(0, element.selectionStart),
    text,
    element.value.slice(element.selectionEnd),
  );
}
function insertDraft(element: HTMLTextAreaElement, before: string, text: string, after: string) {
  let inserted = '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    text.replaceAll('\r\n', '\n').normalize('NFC'),
  )) {
    const candidate = (before + inserted + segment + after).normalize('NFC');
    if (limitDraft(candidate) !== candidate) break;
    inserted += segment;
  }
  element.value = (before + inserted + after).normalize('NFC');
  setDraft(element.value);
  const caret = (before + inserted).normalize('NFC').length;
  element.setSelectionRange(caret, caret);
  syncMentionCaret();
}
function keydown(event: KeyboardEvent) {
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (mentionOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      mentionDismissed.value = true;
      return;
    }
    if (mentionCandidates.value.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const length = mentionCandidates.value.length;
      mentionActive.value =
        (mentionActive.value + (event.key === 'ArrowDown' ? 1 : length - 1)) % length;
      return;
    }
    if (
      mentionCandidates.value.length &&
      !event.shiftKey &&
      (event.key === 'Enter' || event.key === 'Tab')
    ) {
      event.preventDefault();
      void insertMention(mentionCandidates.value[mentionActive.value]!);
      return;
    }
  }
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !composing &&
    !event.isComposing &&
    event.keyCode !== 229
  ) {
    event.preventDefault();
    void send();
  }
}
async function logout() {
  closeIdentityMenu();
  admin.clear();
  await chat.logout();
  if (!store.session) {
    setDraft('');
    selectedReply.value = null;
    sending.value = false;
    newMessages.value = 0;
  }
}
function resizeViewport() {
  viewportHeight.value = window.visualViewport ? `${window.visualViewport.height}px` : '100dvh';
  if (nearBottom.value) void bottom();
}
onMounted(async () => {
  resizeViewport();
  document.addEventListener('visibilitychange', acknowledgeMentions);
  document.addEventListener('pointerdown', dismissIdentityMenu);
  document.addEventListener('focusin', dismissIdentityMenu);
  window.visualViewport?.addEventListener('resize', resizeViewport);
  await chat.initialize();
  if (store.session) await bottom();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(highlightTimer);
  document.removeEventListener('visibilitychange', acknowledgeMentions);
  document.removeEventListener('pointerdown', dismissIdentityMenu);
  document.removeEventListener('focusin', dismissIdentityMenu);
  window.visualViewport?.removeEventListener('resize', resizeViewport);
  joinDialog.value?.close();
});
</script>

<template>
  <section
    class="chat-page"
    :style="{ '--chat-viewport-height': viewportHeight }"
    aria-label="公共聊天室"
  >
    <div class="chat-room">
      <header class="chat-header">
        <span class="chat-room-icon"><IconMessageCircle :size="24" /></span>
        <div class="chat-heading">
          <h1>Meowv Chat</h1>
          <p>偶然相遇，随心聊聊。</p>
        </div>
        <div class="chat-presence">
          <span
            class="chat-status-dot"
            role="img"
            :aria-label="statusText"
            :title="statusText"
            :class="{ 'is-online': store.connectionStatus === 'connected' }"
          ></span
          ><strong>{{ store.onlineUsers }}</strong> 人在线
        </div>
        <div class="chat-header-actions">
          <ThemeToggle class="chat-icon-button" />
          <button
            class="chat-icon-button"
            :class="{ 'is-admin': adminActive }"
            type="button"
            :title="adminActive ? '退出管理模式' : '管理员操作'"
            :aria-label="adminActive ? '退出管理模式' : '管理员操作'"
            :aria-pressed="adminActive"
            @click="openAdmin"
          >
            <IconShieldLock :size="19" />
          </button>
        </div>
      </header>

      <div v-if="store.error" class="chat-banner chat-error" role="alert">
        <span>{{ store.error }}</span
        ><button
          v-if="store.session && store.connectionStatus === 'disconnected'"
          @click="chat.connect"
        >
          <IconRefresh :size="15" />重新连接</button
        ><button
          v-else-if="unavailable"
          @click="
            store.error = '';
            chat.initialize();
          "
        >
          <IconRefresh :size="15" />重试
        </button>
      </div>
      <div v-if="store.connectionStatus === 'reconnecting'" class="chat-banner" role="status">
        连接暂时中断，正在重新连接。消息和草稿已保留。
      </div>

      <div class="chat-timeline">
        <div
          ref="list"
          class="chat-messages"
          aria-label="聊天消息"
          :aria-busy="store.loadingHistory"
          @scroll.passive="scroll"
        >
          <div v-if="initializing" class="chat-empty" role="status">
            <IconMessageCircle :size="36" />
            <p>正在打开匿名聊天室…</p>
          </div>
          <template v-else-if="store.session">
            <div class="chat-history-marker">
              <button
                v-if="store.hasMoreHistory"
                :disabled="store.loadingHistory"
                @click="loadOlder"
              >
                <IconArrowUp :size="14" />{{
                  store.loadingHistory ? '正在加载…' : '加载更早消息'
                }}</button
              ><span v-else
                >没有更早的消息了<span v-if="store.messageCleanupEnabled">
                  · 消息保留 {{ store.retentionDays }} 天</span
                ></span
              >
            </div>
            <div v-if="!store.messages.length" class="chat-empty">
              <IconMessageCircle :size="40" />
              <h2>从一句「你好」开始</h2>
              <p>这里还很安静，来开启今天的对话吧。</p>
            </div>
            <template v-for="(message, index) in store.messages" :key="message.id">
              <div
                v-if="
                  index === 0 ||
                  dateLabel(store.messages[index - 1]!.createdAt) !== dateLabel(message.createdAt)
                "
                class="chat-date"
              >
                <span>{{ dateLabel(message.createdAt) }}</span>
              </div>
              <article
                class="chat-message"
                :class="{
                  'is-own': message.guestId === store.session.guest.id,
                  'is-highlighted': highlightedId === message.id,
                  'is-mentioned': isMentioned(message),
                }"
                :data-message-id="message.id"
              >
                <span
                  class="chat-avatar"
                  :style="{ backgroundColor: avatarColor(message.avatarSeed) }"
                  aria-hidden="true"
                  >{{ [...message.nickname][0] }}</span
                >
                <div class="chat-message-body">
                  <div class="chat-message-meta">
                    <button
                      v-if="message.guestId !== store.session.guest.id"
                      class="chat-author-button"
                      type="button"
                      :aria-label="`提及 ${message.nickname}`"
                      @click="
                        insertMention({
                          id: message.guestId,
                          nickname: message.nickname,
                          avatarSeed: message.avatarSeed,
                          online: false,
                        })
                      "
                    >
                      <strong>{{ message.nickname }}</strong>
                    </button>
                    <strong v-else>{{ message.nickname }}</strong
                    ><span v-if="message.guestId === store.session.guest.id" class="chat-self"
                      >你</span
                    ><time
                      :datetime="message.createdAt"
                      :title="new Date(message.createdAt).toLocaleString()"
                      >{{ timeLabel(message.createdAt) }}</time
                    >
                    <span v-if="isMentioned(message)" class="chat-mentioned-badge">提到了你</span>
                  </div>
                  <div
                    class="chat-message-content"
                    :tabindex="
                      (!message.deleted && message.guestId !== store.session.guest.id) ||
                      adminActive
                        ? 0
                        : undefined
                    "
                    :aria-label="`${message.nickname} 的消息`"
                  >
                    <button
                      v-if="message.reply && !message.deleted"
                      class="chat-quote"
                      type="button"
                      :disabled="message.reply.unavailable"
                      :aria-label="`定位引用消息：${message.reply.nickname || '原消息已不可用'}`"
                      @click="locateReply(message.reply)"
                    >
                      <strong v-if="!message.reply.unavailable">{{
                        message.reply.nickname
                      }}</strong>
                      <span>{{ quoteLabel(message.reply) }}</span>
                    </button>
                    <p :class="{ 'chat-deleted': message.deleted }">
                      <template v-if="message.deleted">此消息已被移除</template>
                      <template v-else
                        ><span
                          v-for="(part, partIndex) in messageParts(message)"
                          :key="partIndex"
                          :class="{
                            'chat-mention-token': !!part.mention,
                            'is-self': part.mention?.guestId === store.session.guest.id,
                          }"
                          >{{ part.text }}</span
                        ></template
                      >
                    </p>
                    <div
                      v-if="
                        (!message.deleted && message.guestId !== store.session.guest.id) ||
                        adminActive
                      "
                      class="chat-hover-actions"
                      role="toolbar"
                      aria-label="消息操作"
                    >
                      <button
                        v-if="!message.deleted && message.guestId !== store.session.guest.id"
                        type="button"
                        :aria-label="`回复 ${message.nickname} 的消息`"
                        @click="replyTo(message)"
                      >
                        <IconCornerUpLeft :size="15" />回复
                      </button>
                      <template v-if="adminActive">
                        <button
                          v-if="message.deleted"
                          type="button"
                          :disabled="admin.busy.value"
                          @click="adminDialogs?.openRestore(message)"
                        >
                          恢复
                        </button>
                        <button v-else type="button" @click="manageMessage(message)">
                          <IconTrash :size="15" aria-hidden="true" />标记删除
                        </button>
                        <button type="button" @click="manageMessage(message, true)">
                          <IconTrashX :size="15" aria-hidden="true" />永久删除
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </article>
            </template>
            <button
              v-if="store.hasNewerHistory"
              class="chat-load-newer"
              :disabled="store.loadingHistory"
              @click="loadNewer"
            >
              {{ store.loadingHistory ? '正在加载…' : '加载较新消息' }}
            </button>
          </template>
          <div v-else class="chat-empty">
            <IconMessageCircle :size="40" />
            <h2>{{ unavailable ? '聊天室暂不可用' : '一个自由交流的角落' }}</h2>
            <p>
              {{
                unavailable
                  ? '请稍后重试，其他 Studio 应用仍可正常使用。'
                  : '取一个昵称，加入大家的对话。'
              }}
            </p>
          </div>
        </div>
        <button
          v-if="chat.mentionIds.value.length"
          class="chat-mention-alert"
          :class="{ 'with-new-messages': newMessages || store.hasNewerHistory }"
          @click="jumpToMention"
        >
          <IconAt :size="16" />有人提到你 · {{ chat.mentionIds.value.length }}
        </button>
        <button
          v-if="newMessages || store.hasNewerHistory"
          class="chat-new-messages"
          @click="store.hasNewerHistory ? backToLatest() : bottom()"
        >
          <IconArrowDown :size="16" />{{
            store.hasNewerHistory ? '回到最新消息' : '有新消息 · 回到最新'
          }}
        </button>
      </div>

      <form class="chat-composer" @submit.prevent="send">
        <details
          v-if="store.session"
          ref="identityMenu"
          class="chat-composer-identity"
          @keydown.esc.prevent.stop="closeIdentityMenu"
        >
          <summary aria-label="匿名身份菜单">
            <span
              class="chat-identity-avatar"
              :style="{ backgroundColor: avatarColor(store.session.guest.avatarSeed) }"
              aria-hidden="true"
              >{{ store.session.guest.nickname.slice(0, 1) }}</span
            >
            <span>{{ store.session.guest.nickname }}</span>
          </summary>
          <div class="chat-identity-menu">
            <button type="button" aria-label="退出匿名会话" :disabled="leaving" @click="logout">
              <IconLogout :size="16" />{{ leaving ? '正在退出…' : '退出匿名会话' }}
            </button>
          </div>
        </details>
        <div v-if="replyPreview" class="chat-reply-draft">
          <div>
            <strong>回复 {{ replyPreview.nickname }}</strong
            ><span>{{ quoteLabel(replyPreview) }}</span>
          </div>
          <button
            class="chat-icon-button"
            type="button"
            aria-label="取消引用"
            @click="selectedReply = null"
          >
            <IconX :size="16" />
          </button>
        </div>
        <div v-if="mentionOpen" class="chat-mention-picker">
          <div class="chat-mention-heading">选择要提及的访客<span>↑↓ 选择 · Enter 确认</span></div>
          <div id="chat-mention-options" role="listbox" aria-label="提及访客">
            <button
              v-for="(participant, index) in mentionCandidates"
              :id="`chat-mention-option-${index}`"
              :key="participant.id"
              type="button"
              role="option"
              :aria-selected="index === mentionActive"
              :class="{ 'is-active': index === mentionActive }"
              @pointerdown.prevent
              @click="insertMention(participant)"
            >
              <span
                class="chat-mention-avatar"
                :style="{ backgroundColor: avatarColor(participant.avatarSeed) }"
                >{{ [...participant.nickname][0] }}</span
              >
              <span class="chat-mention-name"
                >{{ participant.nickname
                }}<small
                  v-if="
                    mentionCandidates.filter((item) => item.nickname === participant.nickname)
                      .length > 1
                  "
                  >{{ participant.id.slice(0, 6) }}</small
                ></span
              >
              <span class="chat-mention-presence">{{
                participant.online ? '在线' : '近期发言'
              }}</span>
            </button>
          </div>
          <p v-if="!mentionCandidates.length">
            {{ chat.participantsLoading.value ? '正在获取访客…' : '没有匹配的访客' }}
          </p>
          <button
            v-if="chat.participantsError.value"
            class="chat-mention-retry"
            type="button"
            @click="chat.loadParticipants(true)"
          >
            {{ chat.participantsError.value }} 点击重试
          </button>
        </div>
        <span v-if="mentionFeedback" class="chat-mention-feedback" role="status">{{
          mentionFeedback
        }}</span>
        <label class="chat-sr-only" for="chat-message-input">消息正文</label>
        <textarea
          id="chat-message-input"
          ref="composer"
          :value="draft"
          rows="2"
          :disabled="!store.session"
          placeholder="说点什么吧..."
          :aria-invalid="!!draft && !contentValid"
          aria-describedby="chat-input-help"
          :aria-expanded="mentionOpen"
          :aria-controls="mentionOpen ? 'chat-mention-options' : undefined"
          :aria-activedescendant="
            mentionOpen && mentionCandidates.length
              ? `chat-mention-option-${mentionActive}`
              : undefined
          "
          @beforeinput="beforeInput"
          @input="input"
          @paste="paste"
          @compositionstart="compositionStart"
          @compositionend="compositionEnd"
          @keydown="keydown"
          @click="syncMentionCaret"
          @keyup="syncMentionCaret"
          @select="syncMentionCaret"
          @blur="blurMentionPicker"
        ></textarea>
        <div class="chat-composer-bottom">
          <span id="chat-input-help">{{
            failed
              ? '发送未确认，草稿已保留，请稍后重试。'
              : sending
                ? '正在发送…'
                : 'Enter 发送 · Shift + Enter 换行'
          }}</span
          ><button
            type="button"
            class="chat-icon-button chat-insert-at"
            aria-label="提及访客"
            :disabled="!store.session"
            @click="insertAt"
          >
            <IconAt :size="18" /></button
          ><span :class="{ 'chat-over-limit': !!draft && !contentValid }"
            >{{ count }}/{{ store.maxMessageChars }}</span
          ><button class="chat-send" type="submit" :disabled="!canSend">
            <IconSend :size="17" />{{ sending ? '发送中' : failed ? '重试发送' : '发送' }}
          </button>
        </div>
      </form>
    </div>

    <dialog ref="joinDialog" class="chat-dialog" aria-labelledby="chat-join-title" @cancel.prevent>
      <form @submit.prevent="join">
        <div class="chat-join-heading">
          <span class="chat-room-icon"><IconMessageCircle :size="24" /></span>
          <div class="chat-heading">
            <h2 id="chat-join-title">Meowv Chat</h2>
            <p>偶然相遇，随心聊聊。</p>
          </div>
        </div>
        <span
          class="chat-avatar chat-preview-avatar"
          :style="{ backgroundColor: avatarColor(nickname) }"
          >{{ [...nickname.trim()][0] || '客' }}</span
        ><label for="chat-nickname">你的昵称</label>
        <div class="chat-nickname-field">
          <input
            id="chat-nickname"
            ref="nicknameInput"
            v-model="nickname"
            autocomplete="nickname"
            :disabled="joining"
            aria-describedby="chat-nickname-help"
          />
          <button
            class="chat-shuffle-nickname"
            type="button"
            :disabled="joining"
            aria-label="换一个昵称"
            title="换一个昵称"
            @click="shuffleNickname"
          >
            <IconRefresh :size="16" />换一个
          </button>
        </div>
        <p id="chat-nickname-help" class="chat-input-hint">2–20 个字符，加入后暂不支持修改。</p>
        <p v-if="store.error" class="chat-error" role="alert">{{ store.error }}</p>
        <button
          class="chat-join-button"
          :disabled="joining || !validNickname(nickname)"
          type="submit"
        >
          {{ joining ? '正在加入…' : '进入聊天室'
          }}<IconArrowUp class="chat-join-arrow" :size="18" />
        </button>
      </form>
    </dialog>
    <ChatAdminDialogs
      ref="adminDialogs"
      :admin="admin"
      @removed="store.remove"
      @restored="store.restore"
    />
  </section>
</template>
