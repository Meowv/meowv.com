import { normalizeOutputMime } from './formats';

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
} as const;

function stripExtension(filename: string): string {
  const normalized = filename.replaceAll('\\', '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).trim();
  const dotIndex = name.lastIndexOf('.');

  if (dotIndex <= 0) {
    return name || 'image';
  }

  return name.slice(0, dotIndex);
}

export function getOutputFilename(originalName: string, mime: string, suffix = ''): string {
  const normalizedMime = normalizeOutputMime(mime);
  const safeSuffix = suffix.replace(/[\\/:*?"<>|\p{Cc}]/gu, '-');
  return `${stripExtension(originalName)}${safeSuffix}.${MIME_EXTENSIONS[normalizedMime]}`;
}
