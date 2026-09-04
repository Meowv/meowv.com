import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

const wallpaperKeyFile = fileURLToPath(new URL('../../.wallpaper-key', import.meta.url));

export function wallpaperDefine(): UserConfig['define'] {
  const wallpaperKey =
    process.env.VITE_WALLPAPER_KEY ??
    (existsSync(wallpaperKeyFile) ? readFileSync(wallpaperKeyFile, 'utf8').trim() : '');

  return wallpaperKey
    ? { 'import.meta.env.VITE_WALLPAPER_KEY': JSON.stringify(wallpaperKey) }
    : undefined;
}
