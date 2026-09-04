import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

const catalogKeyFile = fileURLToPath(new URL('../../.wallpaper-catalog-key', import.meta.url));

export function wallpaperCatalogDefine(): UserConfig['define'] {
  const catalogKey =
    process.env.VITE_WALLPAPER_CATALOG_KEY ??
    (existsSync(catalogKeyFile) ? readFileSync(catalogKeyFile, 'utf8').trim() : '');

  return catalogKey
    ? { 'import.meta.env.VITE_WALLPAPER_CATALOG_KEY': JSON.stringify(catalogKey) }
    : undefined;
}
