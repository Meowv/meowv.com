<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>

<template>
  <RouterLink class="studio-logo" to="/" aria-label="返回 Meowv Studio 首页">
    <img src="/brand/studio.png" alt="" width="44" height="44" draggable="false" />
    <span v-if="!compact" class="studio-logo__wordmark home-copy__product--animated">
      <strong>Meowv</strong> Studio
    </span>
    <span class="studio-logo__leaf" aria-hidden="true">●</span>
  </RouterLink>
</template>
