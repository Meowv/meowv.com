<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);
let previousFocus: HTMLElement | null = null;

const close = () => emit('close');
const onKeydown = (event: KeyboardEvent) => {
  if (props.open && event.key === 'Escape') {
    event.preventDefault();
    close();
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      closeButton.value?.focus();
    } else {
      previousFocus?.focus();
      previousFocus = null;
    }
  },
);
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="donation-backdrop" @click.self="close">
      <section class="donation-dialog" role="dialog" aria-modal="true" aria-labelledby="donation-title">
        <header>
          <div>
            <h2 id="donation-title">捐赠支持</h2>
            <p>如果 Meowv Office 对你有帮助，欢迎请作者喝杯咖啡。</p>
          </div>
          <button ref="closeButton" type="button" aria-label="关闭捐赠支持" @click="close">×</button>
        </header>
        <div class="donation-dialog__codes">
          <figure>
            <img src="https://meowv.com/medias/reward/alipay.png" alt="支付宝捐赠二维码" referrerpolicy="no-referrer" />
            <figcaption>支付宝</figcaption>
          </figure>
          <figure>
            <img src="https://meowv.com/medias/reward/wechat.png" alt="微信捐赠二维码" referrerpolicy="no-referrer" />
            <figcaption>微信赞赏</figcaption>
          </figure>
        </div>
      </section>
    </div>
  </Teleport>
</template>
