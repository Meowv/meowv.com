import { shallowRef } from 'vue';

export type StudioFeature =
  'image' | 'psd' | 'markdown' | 'pdf' | 'office' | 'draw' | 'mind' | 'notes';

export interface FileHandoff {
  feature: StudioFeature;
  file: File;
  handle?: FileSystemFileHandle;
  createdAt: number;
}

interface WindowFileHandoffMessage {
  type: 'studio-file-handoff';
  feature: StudioFeature;
  file: File;
  handle?: FileSystemFileHandle;
}

interface WindowFileHandoffReadyMessage {
  type: 'studio-file-handoff-ready';
  feature: StudioFeature;
}

const currentHandoff = shallowRef<FileHandoff | null>(null);

const extensionGroups: Record<StudioFeature, Set<string>> = {
  image: new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'svg', 'webp']),
  psd: new Set(['psd']),
  markdown: new Set(['markdown', 'md', 'mdown', 'mkd', 'txt']),
  pdf: new Set(['pdf']),
  office: new Set(['csv', 'docx', 'pptx', 'xlsx']),
  draw: new Set(['excalidraw']),
  mind: new Set(['mind']),
  notes: new Set<string>([]),
};

export function featureForFile(file: File): StudioFeature | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (
    (Object.entries(extensionGroups) as Array<[StudioFeature, Set<string>]>).find(
      ([, extensions]) => extensions.has(extension),
    )?.[0] ?? null
  );
}

export function routeForFeature(feature: StudioFeature, file?: File): string {
  const defaultRoutes: Record<StudioFeature, string> = {
    image: '/image/compress',
    psd: '/image/psd-viewer',
    markdown: '/markdown',
    pdf: '/pdf/merge-pdf',
    office: '/office',
    draw: '/draw',
    mind: '/mind',
    notes: '/notes',
  };

  if (feature !== 'office' || !file) return defaultRoutes[feature];
  const extension = file.name.split('.').pop()?.toLowerCase();
  const officeRoutes: Record<string, string> = {
    docx: '/office/doc',
    xlsx: '/office/xls',
    pptx: '/office/ppt',
    csv: '/office/csv',
  };
  return officeRoutes[extension || ''] || defaultRoutes.office;
}

export function handoffFile(
  file: File,
  feature = featureForFile(file),
  handle?: FileSystemFileHandle,
): FileHandoff | null {
  if (!feature) return null;
  const handoff = {
    feature,
    file,
    ...(handle ? { handle } : {}),
    createdAt: Date.now(),
  } satisfies FileHandoff;
  currentHandoff.value = handoff;
  return handoff;
}

export function openWindowFileHandoff(
  popup: Window,
  route: string,
  feature: StudioFeature,
  file: File,
  handle?: FileSystemFileHandle,
): () => void {
  const origin = globalThis.location.origin;
  const onMessage = (event: MessageEvent<WindowFileHandoffReadyMessage>): void => {
    if (
      event.origin !== origin ||
      event.source !== popup ||
      event.data?.type !== 'studio-file-handoff-ready' ||
      event.data.feature !== feature
    ) {
      return;
    }
    popup.postMessage(
      {
        type: 'studio-file-handoff',
        feature,
        file,
        ...(handle ? { handle } : {}),
      } satisfies WindowFileHandoffMessage,
      origin,
    );
    cleanup();
  };
  const timeout = globalThis.setTimeout(() => cleanup(), 15_000);
  const cleanup = (): void => {
    globalThis.clearTimeout(timeout);
    globalThis.removeEventListener('message', onMessage);
  };

  globalThis.addEventListener('message', onMessage);
  popup.location.href = route;
  return cleanup;
}

export function receiveWindowFileHandoff(
  feature: StudioFeature,
  onFile: (file: File, handle?: FileSystemFileHandle) => void,
): () => void {
  const opener = globalThis.opener;
  if (!opener) {
    return () => undefined;
  }
  const origin = globalThis.location.origin;
  const onMessage = (event: MessageEvent<WindowFileHandoffMessage>): void => {
    if (
      event.origin !== origin ||
      event.source !== opener ||
      event.data?.type !== 'studio-file-handoff' ||
      event.data.feature !== feature ||
      !(event.data.file instanceof File)
    ) {
      return;
    }
    onFile(event.data.file, event.data.handle);
    cleanup();
  };
  const timeout = globalThis.setTimeout(() => cleanup(), 15_000);
  const cleanup = (): void => {
    globalThis.clearTimeout(timeout);
    globalThis.removeEventListener('message', onMessage);
  };

  globalThis.addEventListener('message', onMessage);
  opener.postMessage(
    { type: 'studio-file-handoff-ready', feature } satisfies WindowFileHandoffReadyMessage,
    origin,
  );
  return cleanup;
}

export function useFileHandoff() {
  const takeHandoff = (feature: StudioFeature): FileHandoff | null => {
    if (currentHandoff.value?.feature !== feature) return null;
    const handoff = currentHandoff.value;
    currentHandoff.value = null;
    return handoff;
  };
  const take = (feature: StudioFeature): File | null => takeHandoff(feature)?.file ?? null;

  return { currentHandoff, take, takeHandoff };
}
