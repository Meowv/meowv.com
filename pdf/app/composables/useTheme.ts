export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "meowv.pdf.theme";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function useTheme() {
  const preference = useState<ThemePreference>("theme-preference", () => "system");
  const systemTheme = useState<ResolvedTheme>("system-theme", () => "light");
  let media: MediaQueryList | undefined;

  const resolvedTheme = computed<ResolvedTheme>(() =>
    preference.value === "system" ? systemTheme.value : preference.value
  );

  const applyTheme = () => {
    if (!import.meta.client) return;
    document.documentElement.dataset.theme = resolvedTheme.value;
    document.documentElement.style.colorScheme = resolvedTheme.value;
  };

  const setTheme = (value: ThemePreference) => {
    preference.value = value;
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, value);
      applyTheme();
    }
  };

  const cycleTheme = () => {
    const themes: ThemePreference[] = ["system", "light", "dark"];
    const currentIndex = themes.indexOf(preference.value);
    setTheme(themes[(currentIndex + 1) % themes.length] ?? "system");
  };

  const updateSystemTheme = (event?: MediaQueryListEvent) => {
    systemTheme.value = (event?.matches ?? media?.matches) ? "dark" : "light";
    applyTheme();
  };

  onMounted(() => {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    preference.value = isThemePreference(storedTheme) ? storedTheme : "system";
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
  });

  onBeforeUnmount(() => media?.removeEventListener("change", updateSystemTheme));

  watch(resolvedTheme, applyTheme);

  return {
    preference: readonly(preference),
    resolvedTheme: readonly(resolvedTheme),
    setTheme,
    cycleTheme
  };
}
