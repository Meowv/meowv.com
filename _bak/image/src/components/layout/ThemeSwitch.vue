<script setup lang="ts">
import { Laptop, Moon, Sun } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "image-studio-theme";
const preference = ref<ThemePreference>("system");
let systemTheme: MediaQueryList | null = null;

const themeLabel = computed(() => {
  if (preference.value === "light") {
    return "当前为浅色模式，点击切换为深色模式";
  }
  if (preference.value === "dark") {
    return "当前为深色模式，点击切换为跟随系统";
  }
  return "当前跟随系统主题，点击切换为浅色模式";
});

function applyTheme(): void {
  const useDark =
    preference.value === "dark" ||
    (preference.value === "system" && Boolean(systemTheme?.matches));

  document.documentElement.classList.toggle("dark", useDark);
  document.documentElement.style.colorScheme = useDark ? "dark" : "light";
}

function savePreference(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference.value);
  } catch {
    // 浏览器禁用本地存储时，主题仍可在当前页面生效。
  }
}

function cycleTheme(): void {
  preference.value =
    preference.value === "system"
      ? "light"
      : preference.value === "light"
        ? "dark"
        : "system";
  savePreference();
  applyTheme();
}

function handleSystemThemeChange(): void {
  if (preference.value === "system") {
    applyTheme();
  }
}

onMounted(() => {
  systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

  try {
    const savedPreference = window.localStorage.getItem(STORAGE_KEY);
    if (
      savedPreference === "system" ||
      savedPreference === "light" ||
      savedPreference === "dark"
    ) {
      preference.value = savedPreference;
    }
  } catch {
    preference.value = "system";
  }

  applyTheme();
  systemTheme.addEventListener("change", handleSystemThemeChange);
});

onBeforeUnmount(() => {
  systemTheme?.removeEventListener("change", handleSystemThemeChange);
});
</script>

<template>
  <button
    class="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 outline-none transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-700 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
    type="button"
    :aria-label="themeLabel"
    :title="themeLabel"
    @click="cycleTheme"
  >
    <Laptop v-if="preference === 'system'" :size="18" aria-hidden="true" />
    <Sun v-else-if="preference === 'light'" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>
