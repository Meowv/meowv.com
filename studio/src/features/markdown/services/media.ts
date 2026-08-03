type MediaCategory = 'audio' | 'video';

const MEDIA_MIME_TYPES: Readonly<Record<string, string>> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function createTypedMediaBlob(file: File, category: MediaCategory): Blob {
  const fallback = category === 'audio' ? 'audio/mpeg' : 'video/mp4';
  const type = MEDIA_MIME_TYPES[extensionOf(file.name)] || file.type || fallback;
  return new Blob([file], { type });
}
