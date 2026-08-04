import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { handoffFile, routeForFeature } from '@/core/browser/file-handoff';

export const STUDIO_FILE_ACCEPT =
  '.avif,.bmp,.gif,.heic,.heif,.jpeg,.jpg,.png,.psd,.svg,.webp,.md,.markdown,.txt,.pdf,.docx,.xlsx,.pptx,.csv';

export function useFileLauncher() {
  const router = useRouter();
  const error = ref('');
  const busy = ref(false);

  const launchFile = async (file: File) => {
    error.value = '';
    busy.value = true;
    try {
      const handoff = handoffFile(file);
      if (!handoff) {
        error.value = `暂不支持“${file.name}”的文件格式。`;
        return;
      }
      await router.push(routeForFeature(handoff.feature));
    } finally {
      busy.value = false;
    }
  };

  return { busy, error, launchFile };
}
