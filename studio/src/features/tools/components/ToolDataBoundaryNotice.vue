<script setup lang="ts">
import { IconExternalLink, IconShieldCheck } from '@tabler/icons-vue';
import type { ToolDataBoundary } from '@/features/tools/config/toolContracts';

defineProps<{
  boundary: ToolDataBoundary;
}>();
</script>

<template>
  <aside v-if="boundary.kind !== 'local'" class="tool-data-boundary" role="note">
    <IconExternalLink v-if="boundary.kind === 'thirdParty'" :size="18" aria-hidden="true" />
    <IconShieldCheck v-else :size="18" aria-hidden="true" />
    <div>
      <strong>{{ boundary.label }}</strong>
      <span v-if="boundary.kind === 'thirdParty'">
        {{ boundary.provider }}（{{ boundary.hostname }}） · 传输：{{ boundary.sends.join('、') }}
      </span>
      <span v-else>传输：{{ boundary.sends.join('、') }}；不会经过 Meowv Studio 服务器。</span>
    </div>
  </aside>
</template>
