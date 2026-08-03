<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconHeart, IconX } from '@tabler/icons-vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const closeButton = ref<HTMLButtonElement>();
let lastActiveElement: HTMLElement | null = null;

const donationMethods = [
  { name: '支付宝', image: 'https://meowv.com/medias/reward/alipay.png' },
  { name: '微信', image: 'https://meowv.com/medias/reward/wechat.png' },
];

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close();
  }
}

function resetDialogState() {
  document.removeEventListener('keydown', handleKeydown);
  document.body.classList.remove('has-dialog-open');
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) {
      resetDialogState();
      lastActiveElement?.focus();
      lastActiveElement = null;
      return;
    }

    lastActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('has-dialog-open');
    document.addEventListener('keydown', handleKeydown);
    await nextTick();
    closeButton.value?.focus();
  },
);

onBeforeUnmount(resetDialogState);
</script>

<template>
  <Teleport to="body">
    <Transition name="donation-dialog">
      <div v-if="modelValue" class="donation-dialog" @click.self="close">
        <section
          class="donation-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="donation-dialog-title"
        >
          <button
            ref="closeButton"
            class="donation-dialog__close"
            type="button"
            aria-label="关闭赞助支持弹窗"
            @click="close"
          >
            <IconX :size="20" stroke-width="2" aria-hidden="true" />
          </button>

          <header class="donation-dialog__header">
            <p class="donation-dialog__eyebrow">
              <IconHeart :size="16" aria-hidden="true" /> 感谢你的支持
            </p>
            <h2 id="donation-dialog-title">让好用的工具更加好用</h2>
            <p>如果 Meowv Studio 为你省下了时间，欢迎扫码支持。</p>
          </header>

          <section class="donation-dialog__methods" aria-label="赞助二维码">
            <div class="donation-dialog__methods-grid">
              <figure v-for="method in donationMethods" :key="method.name">
                <img
                  :src="method.image"
                  :alt="`${method.name}收款二维码`"
                  width="240"
                  height="240"
                />
                <figcaption>{{ method.name }}</figcaption>
              </figure>
            </div>
          </section>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
