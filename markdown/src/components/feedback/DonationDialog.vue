<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

function close(): void {
  store.donationOpen = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (store.donationOpen && event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

watch(
  () => store.donationOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      await nextTick();
      closeButton.value?.focus();
      return;
    }
    previouslyFocusedElement?.focus();
    previouslyFocusedElement = null;
  },
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="store.donationOpen" class="modal-backdrop" @click.self="close">
      <section class="modal donation-dialog" role="dialog" aria-modal="true" aria-labelledby="donation-dialog-title">
        <header class="modal__header">
          <div>
            <h2 id="donation-dialog-title">捐赠支持</h2>
            <p>如果 Markdown Studio 对你有帮助，欢迎请作者喝杯咖啡。</p>
          </div>
          <button ref="closeButton" class="icon-button" type="button" aria-label="关闭捐赠支持" @click="close">
            <X aria-hidden="true" />
          </button>
        </header>
        <div class="modal__body donation-dialog__body">
          <figure>
            <img src="https://meowv.com/medias/reward/alipay.png" alt="支付宝捐赠二维码" referrerpolicy="no-referrer" />
            <figcaption>支付宝</figcaption>
          </figure>
          <figure>
            <img src="https://meowv.com/medias/reward/wechat.png" alt="微信捐赠二维码" referrerpolicy="no-referrer" />
            <figcaption>微信</figcaption>
          </figure>
        </div>
      </section>
    </div>
  </Teleport>
</template>
