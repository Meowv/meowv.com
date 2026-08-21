import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { featureForFile, handoffFile, routeForFeature } from '@/core/browser/file-handoff';

export const STUDIO_FILE_ACCEPT =
  '.avif,.bmp,.gif,.heic,.heif,.jpeg,.jpg,.png,.psd,.svg,.tif,.tiff,.webp,.md,.markdown,.txt,.pdf,.docx,.xlsx,.pptx,.csv,.excalidraw,.mind';

export function useFileLauncher() {
  const router = useRouter();
  const error = ref('');
  const busy = ref(false);

  const launchFile = async (file: File, handle?: FileSystemFileHandle) => {
    error.value = '';
    busy.value = true;
    try {
      const feature = featureForFile(file);
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
        feature === 'draw' || feature === 'office' ? handle : undefined,
      );
      if (!handoff) return;
      await router.push(routeForFeature(handoff.feature, file));
    } finally {
      busy.value = false;
    }
  };

  return { busy, error, launchFile };
}
