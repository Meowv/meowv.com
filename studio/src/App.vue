<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppErrorBoundary from '@/components/AppErrorBoundary.vue';
import { routeLoading } from '@/core/shared/route-state';
import StudioShell from '@/layouts/StudioShell.vue';
</script>

<template>
  <StudioShell>
    <AppErrorBoundary>
      <section v-if="routeLoading" class="route-loading" aria-live="polite">
        <span aria-hidden="true"></span>
        <p>正在准备本地工作区…</p>
      </section>
      <RouterView v-else />
    </AppErrorBoundary>
  </StudioShell>
</template>
