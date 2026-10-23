<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { IconX } from '@tabler/icons-vue';
import type { ChatMessage } from './chat-types';
import type { useChatAdmin } from './useChatAdmin';

const props = defineProps<{ admin: ReturnType<typeof useChatAdmin> }>();
const emit = defineEmits<{
  removed: [id: string, permanent: boolean, revision: number];
  restored: [message: ChatMessage];
}>();
const { active, busy, error } = props.admin;
const loginDialog = ref<HTMLDialogElement | null>(null);
const actionDialog = ref<HTMLDialogElement | null>(null);
const keyInput = ref('');
const keyElement = ref<HTMLInputElement | null>(null);
const target = ref<ChatMessage | null>(null);
const permanent = ref(false);
const restoring = ref(false);

async function openLogin() {
  error.value = '';
  keyInput.value = '';
  await nextTick();
  loginDialog.value?.showModal();
  keyElement.value?.focus();
}
function cancelLogin() {
  keyInput.value = '';
  props.admin.clear();
  loginDialog.value?.close();
}
function backdrop(event: MouseEvent, close: () => void) {
  const dialog = event.currentTarget as HTMLDialogElement | null;
  if (!dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    close();
}
async function verify() {
  if (!keyInput.value || busy.value) return;
  const key = keyInput.value;
  keyInput.value = '';
  if (await props.admin.verify(key)) {
    loginDialog.value?.close();
  } else keyElement.value?.focus();
}
async function openDelete(message: ChatMessage, physically = false) {
  if (!active.value) return;
  target.value = message;
  permanent.value = physically;
  restoring.value = false;
  error.value = '';
  await nextTick();
  actionDialog.value?.showModal();
}
async function openRestore(message: ChatMessage) {
  await openDelete(message);
  restoring.value = true;
}
function cancelAction(event?: Event) {
  if (busy.value) {
    event?.preventDefault();
    return;
  }
  actionDialog.value?.close();
  target.value = null;
}
async function confirmAction() {
  if (!target.value || busy.value) return;
  const message = target.value;
  const restored = restoring.value ? await props.admin.restoreMessage(message) : null;
  const success = restoring.value
    ? !!restored
    : await props.admin.removeMessage(message, permanent.value);
  if (success) {
    if (restored) emit('restored', restored);
    else emit('removed', message.id, permanent.value, message.revision + 1);
    actionDialog.value?.close();
    target.value = null;
  } else if (!active.value) {
    actionDialog.value?.close();
    await nextTick();
    loginDialog.value?.showModal();
    keyElement.value?.focus();
  }
}
onBeforeUnmount(() => {
  keyInput.value = '';
  loginDialog.value?.close();
  actionDialog.value?.close();
});
defineExpose({ openLogin, openDelete, openRestore });
</script>

<template>
  <dialog
    ref="loginDialog"
    class="chat-dialog chat-admin-dialog"
    aria-label="管理员验证"
    @cancel.prevent="cancelLogin"
    @click="backdrop($event, cancelLogin)"
  >
    <form @submit.prevent="verify">
      <input
        id="chat-admin-key"
        ref="keyElement"
        v-model="keyInput"
        type="password"
        autocomplete="off"
        placeholder="授权码"
        aria-label="授权码"
        :disabled="busy"
        maxlength="1024"
      />
      <p v-if="error" class="chat-error chat-admin-error" role="alert">{{ error }}</p>
      <button class="chat-join-button" :disabled="busy || !keyInput" type="submit">
        {{ busy ? '正在验证…' : '验证并进入管理模式' }}
      </button>
    </form>
  </dialog>
  <dialog
    ref="actionDialog"
    class="chat-dialog chat-admin-dialog"
    aria-labelledby="chat-moderation-title"
    @cancel="cancelAction"
    @click="backdrop($event, () => cancelAction())"
  >
    <form @submit.prevent="confirmAction">
      <div class="chat-admin-dialog-heading">
        <h2 id="chat-moderation-title">
          {{ restoring ? '恢复消息' : permanent ? '永久删除消息' : '标记删除消息' }}
        </h2>
        <button
          class="chat-icon-button"
          type="button"
          :disabled="busy"
          aria-label="取消管理操作"
          @click="cancelAction()"
        >
          <IconX :size="19" />
        </button>
      </div>
      <blockquote v-if="target" class="chat-moderation-preview">
        <strong>{{ target.nickname }}</strong>
        <p>{{ target.deleted ? '此消息已被移除' : target.content.slice(0, 160) }}</p>
      </blockquote>
      <p v-if="error" class="chat-error chat-admin-error" role="alert">{{ error }}</p>
      <button class="chat-join-button" type="submit" :disabled="busy">
        {{
          busy ? '正在处理…' : restoring ? '确认恢复' : permanent ? '确认永久删除' : '确认标记删除'
        }}
      </button>
    </form>
  </dialog>
</template>
