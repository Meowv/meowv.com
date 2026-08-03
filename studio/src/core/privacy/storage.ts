import type { StudioFeature } from '@/core/browser/file-handoff';

export const STORAGE_POLICY = {
  preferences: 'meowv-studio:preferences:v1',
  namespace(feature: StudioFeature): string {
    return `meowv-studio:${feature}:v1`;
  },
} as const;

export function storageAvailable(): boolean {
  try {
    const key = '__meowv_studio_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
