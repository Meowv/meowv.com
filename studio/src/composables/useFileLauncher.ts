import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  featureForFile,
  handoffFile,
  routeForFeature,
  type StudioFeature,
} from '@/core/browser/file-handoff';

export const STUDIO_FILE_PICKER_TYPES = [
  {
    description: 'Studio 支持的文件',
    accept: {
      'image/avif': ['.avif'],
      'image/bmp': ['.bmp'],
      'image/gif': ['.gif'],
      'image/heic': ['.heic', '.heif'],
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/vnd.adobe.photoshop': ['.psd'],
      'image/svg+xml': ['.svg'],
      'image/tiff': ['.tif', '.tiff'],
      'image/webp': ['.webp'],
      'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'],
      'text/plain': ['.txt'],
      'text/x-mermaid': ['.mmd', '.mermaid'],
      'application/json': ['.mermaid.json', '.floorplan.json'],
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub'],
      'application/x-fictionbook+xml': ['.fb2'],
      'application/octet-stream': ['.mobi', '.azw3', '.cbz', '.db', '.sqlite', '.sqlite3', '.db3'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/csv': ['.csv'],
      'application/vnd.excalidraw+json': ['.excalidraw'],
      'application/x-meowv-mind': ['.mind'],
    },
  },
];

export const STUDIO_FILE_ACCEPT = STUDIO_FILE_PICKER_TYPES.flatMap((type) =>
  Object.values(type.accept).flat(),
).join(',');

export function studioFeatureForFile(file: File): StudioFeature | null {
  const feature = featureForFile(file);
  return feature === 'pdf' ? 'book' : feature;
}

export function useFileLauncher() {
  const router = useRouter();
  const error = ref('');
  const busy = ref(false);

  const launchFile = async (file: File, handle?: FileSystemFileHandle) => {
    error.value = '';
    busy.value = true;
    try {
      const feature = studioFeatureForFile(file);
      if (!feature) {
        error.value = `暂不支持“${file.name}”的文件格式。`;
        return;
      }
      if ((feature === 'draw' || feature === 'office') && handle) {
        try {
          const currentPermission = await handle.queryPermission({ mode: 'readwrite' });
          if (currentPermission !== 'granted') {
            await handle.requestPermission({ mode: 'readwrite' });
          }
        } catch {
          // 句柄仍会交给目标编辑器，用户可在后续保存时重新授权。
        }
      }
      const handoff = handoffFile(
        file,
        feature,
        feature === 'draw' || feature === 'office' || feature === 'book' ? handle : undefined,
      );
      if (!handoff) return;
      await router.push(routeForFeature(handoff.feature, file));
    } finally {
      busy.value = false;
    }
  };

  return { busy, error, launchFile };
}
