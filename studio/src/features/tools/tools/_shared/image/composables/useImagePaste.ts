import { onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter } from 'vue';

import { isSupportedImageFilename } from '@/features/tools/tools/_shared/image/core/image';

type ImagePasteHandler = (files: File[]) => void | Promise<void>;

interface ImagePasteOptions {
  disabled?: MaybeRefOrGetter<boolean>;
  multiple?: boolean;
  filter?: (file: File) => boolean;
}

const CLIPBOARD_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/ico': 'ico',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tif': 'tif',
  'image/tiff': 'tiff',
  'image/vnd.adobe.photoshop': 'psd',
  'image/vnd.microsoft.icon': 'ico',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/x-photoshop': 'psd',
  'image/x-tiff': 'tiff',
};

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    )
  );
}

function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }

  const itemFiles = Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  return itemFiles.length > 0 ? itemFiles : Array.from(data.files);
}

function normalizeClipboardFilename(file: File): File {
  if (isSupportedImageFilename(file.name)) {
    return file;
  }

  const extension = CLIPBOARD_IMAGE_EXTENSIONS[file.type.toLowerCase()];
  if (!extension) {
    return file;
  }

  return new File([file], `clipboard-image.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith('image/') || isSupportedImageFilename(file.name);
}

export function useImagePaste(onFiles: ImagePasteHandler, options: ImagePasteOptions = {}): void {
  function handlePaste(event: ClipboardEvent): void {
    if (toValue(options.disabled ?? false) || isEditableTarget(event.target)) {
      return;
    }

    const filter = options.filter ?? isImageFile;
    const files = clipboardFiles(event.clipboardData)
      .map(normalizeClipboardFilename)
      .filter(filter);
    const acceptedFiles = options.multiple === false ? files.slice(0, 1) : files;

    if (acceptedFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onFiles(acceptedFiles);
  }

  onMounted(() => window.addEventListener('paste', handlePaste));
  onBeforeUnmount(() => window.removeEventListener('paste', handlePaste));
}
