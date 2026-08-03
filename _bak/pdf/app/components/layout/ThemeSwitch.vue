<script setup lang="ts">
import { Laptop, Moon, Sun } from "@lucide/vue";

const { preference, cycleTheme } = useTheme();

const themeLabel = computed(() => {
  if (preference.value === "light") return "当前为浅色模式，点击切换为深色模式";
  if (preference.value === "dark") return "当前为深色模式，点击切换为跟随系统";
  return "当前跟随系统主题，点击切换为浅色模式";
});
</script>

<template>
  <button class="theme-switch" type="button" :aria-label="themeLabel" @click="cycleTheme">
    <Laptop v-if="preference === 'system'" :size="18" />
    <Sun v-else-if="preference === 'light'" :size="18" />
    <Moon v-else :size="18" />
  </button>
</template>
