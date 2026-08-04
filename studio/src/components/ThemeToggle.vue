<script setup lang="ts">
import { IconMoonFilled, IconSunFilled } from '@tabler/icons-vue';
import { useTheme } from '@/composables/useTheme';

withDefaults(defineProps<{ size?: number }>(), {
  size: 18,
});

const { resolved, toggle } = useTheme();
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="resolved === 'dark' ? '切换为浅色模式' : '切换为深色模式'"
    :title="resolved === 'dark' ? '切换为浅色模式' : '切换为深色模式'"
    @click="toggle"
  >
    <IconMoonFilled v-if="resolved === 'dark'" :size="size" stroke-width="1.8" aria-hidden="true" />
    <IconSunFilled v-else :size="size" stroke-width="1.8" aria-hidden="true" />
  </button>
</template>
