import { shallowRef } from 'vue';

export type StudioFeature = 'image' | 'markdown' | 'pdf' | 'office';

export interface FileHandoff {
  feature: StudioFeature;
  file: File;
  createdAt: number;
}

const currentHandoff = shallowRef<FileHandoff | null>(null);

const extensionGroups: Record<StudioFeature, Set<string>> = {
  image: new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'svg', 'webp']),
  markdown: new Set(['markdown', 'md', 'mdown', 'mkd', 'txt']),
  pdf: new Set(['pdf']),
  office: new Set(['csv', 'docx', 'pptx', 'xlsx']),
};

export function featureForFile(file: File): StudioFeature | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (
    (Object.entries(extensionGroups) as Array<[StudioFeature, Set<string>]>).find(
      ([, extensions]) => extensions.has(extension),
    )?.[0] ?? null
  );
}

export function routeForFeature(feature: StudioFeature): string {
  const defaultRoutes: Record<StudioFeature, string> = {
    image: '/image/compress',
    markdown: '/markdown',
    pdf: '/pdf/merge-pdf',
    office: '/office',
  };

  return defaultRoutes[feature];
}

export function handoffFile(file: File, feature = featureForFile(file)): FileHandoff | null {
  if (!feature) return null;
  const handoff = { feature, file, createdAt: Date.now() } satisfies FileHandoff;
  currentHandoff.value = handoff;
  return handoff;
}

export function useFileHandoff() {
  const take = (feature: StudioFeature): File | null => {
    if (currentHandoff.value?.feature !== feature) return null;
    const file = currentHandoff.value.file;
    currentHandoff.value = null;
    return file;
  };

  return { currentHandoff, take };
}
