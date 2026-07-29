import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { settingsRepository } from "@/db/repositories/settings.repository";
import type { AppSettings } from "@/models/workbook";
import { DEFAULT_APP_SETTINGS } from "@/models/workbook";

export type ThemeMode = "light" | "dark" | "system";

export type EditableAppSettings = AppSettings;

const DEFAULT_SETTINGS: EditableAppSettings = { ...DEFAULT_APP_SETTINGS };

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === "undefined") return;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<EditableAppSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);
  const saving = ref(false);
  const effectiveTheme = computed<"light" | "dark">(() => {
    if (settings.value.theme !== "system") return settings.value.theme;
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  let watchingSystemTheme = false;

  function watchSystemTheme() {
    if (watchingSystemTheme || typeof window === "undefined") return;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (settings.value.theme === "system") applyTheme("system");
    });
    watchingSystemTheme = true;
  }

  async function load() {
    const saved = await settingsRepository.get();
    settings.value = {
      ...DEFAULT_SETTINGS,
      ...(saved ?? {}),
    };
    loaded.value = true;
    applyTheme(settings.value.theme);
    watchSystemTheme();
    return settings.value;
  }

  async function update(patch: Partial<EditableAppSettings>) {
    settings.value = {
      ...settings.value,
      ...patch,
      id: "global",
      locale: "zh-CN",
    };
    applyTheme(settings.value.theme);
    saving.value = true;
    try {
      await settingsRepository.save(settings.value);
    } finally {
      saving.value = false;
    }
  }

  async function reset() {
    settings.value = { ...DEFAULT_SETTINGS };
    saving.value = true;
    try {
      if ("reset" in settingsRepository && typeof settingsRepository.reset === "function") {
        await settingsRepository.reset();
      } else {
        await settingsRepository.save(settings.value);
      }
      applyTheme(settings.value.theme);
    } finally {
      saving.value = false;
    }
  }

  return {
    effectiveTheme,
    loaded,
    saving,
    settings,
    load,
    reset,
    update,
  };
});
