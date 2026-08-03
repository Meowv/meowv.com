import { computed } from 'vue';

export function useTheme() {
  const resolved = computed<'light' | 'dark'>(() => 'light');

  return { resolved };
}
