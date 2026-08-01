<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cycleTheme, getThemeMode, type ThemeMode } from '../theme';

const mode = ref<ThemeMode>(getThemeMode());
const labels: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
};

const updateMode = (event: Event) => {
  mode.value = (event as CustomEvent<ThemeMode>).detail;
};

const toggle = () => {
  mode.value = cycleTheme();
};

onMounted(() => document.addEventListener('office:theme-changed', updateMode));
onBeforeUnmount(() => document.removeEventListener('office:theme-changed', updateMode));
</script>

<template>
  <button
    class="theme-cycle"
    type="button"
    :aria-label="`当前${labels[mode]}，点击切换主题`"
    :title="labels[mode]"
    @click="toggle"
  >
    <svg v-if="mode === 'light'" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.2" />
      <path
        d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8M15.8 4.2l-1.5 1.5M5.7 14.3l-1.5 1.5M15.8 15.8l-1.5-1.5M5.7 5.7 4.2 4.2"
      />
    </svg>
    <svg v-else-if="mode === 'dark'" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.4 12.7A7.2 7.2 0 0 1 7.3 3.6 7.2 7.2 0 1 0 16.4 12.7Z" />
    </svg>
    <svg v-else viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.3" y="3.1" width="15.4" height="10.6" rx="1.7" />
      <path d="M7.1 17h5.8M10 13.7V17" />
    </svg>
  </button>
</template>
