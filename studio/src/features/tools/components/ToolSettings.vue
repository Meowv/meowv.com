<script setup lang="ts">
import type { ToolSettingsMode } from '@/features/tools/config/toolContracts';

defineProps<{
  mode: ToolSettingsMode;
  title?: string;
}>();
</script>

<template>
  <section v-if="mode !== 'none'" class="tool-settings" :class="`tool-settings--${mode}`">
    <h2 v-if="mode === 'panel'">{{ title ?? '设置' }}</h2>
    <div class="tool-settings__content">
      <slot />
    </div>
  </section>
</template>
