const BACKGROUND_DIRECTORY = '/data/background/';

type DirectoryEntry = {
  name?: unknown;
  type?: unknown;
  mtime?: unknown;
  size?: unknown;
};

function createVideoUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as DirectoryEntry;
  if (entry.type !== 'file' || typeof entry.name !== 'string' || !/\.mp4$/i.test(entry.name)) {
    return null;
  }

  const path = `${BACKGROUND_DIRECTORY}${encodeURIComponent(entry.name)}`;
  const modifiedAt = typeof entry.mtime === 'string' ? Date.parse(entry.mtime) : Number.NaN;
  const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : null;
  const version = [size, Number.isFinite(modifiedAt) ? modifiedAt : null]
    .filter((value): value is number => value !== null)
    .join('-');

  return version ? `${path}?v=${version}` : path;
}

export async function fetchBackgroundVideoCatalog(): Promise<string[]> {
  const response = await fetch(BACKGROUND_DIRECTORY, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`背景视频目录请求失败：${response.status}`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('背景视频目录响应格式无效。');

  return payload
    .map(createVideoUrl)
    .filter((url): url is string => Boolean(url))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function getBackgroundVideoPath(url: string): string | null {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}
