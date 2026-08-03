<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-vue';
import { readableError } from '@/core/shared/errors';

const message = ref('');

onErrorCaptured((error) => {
  message.value = readableError(error);
  return false;
});

const reload = () => window.location.reload();
</script>

<template>
  <section v-if="message" class="app-error" role="alert">
    <IconAlertTriangle :size="38" stroke-width="1.5" aria-hidden="true" />
    <div>
      <p class="eyebrow">WORKSPACE INTERRUPTED</p>
      <h1>当前工具没有完成加载。</h1>
      <p>{{ message }}</p>
      <button class="button button--secondary" type="button" @click="reload">
        <IconRefresh :size="18" aria-hidden="true" /> 重新加载
      </button>
    </div>
  </section>
  <slot v-else />
</template>
