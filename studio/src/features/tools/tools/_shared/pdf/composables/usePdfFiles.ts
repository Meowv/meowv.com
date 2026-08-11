import type { LoadedPdfFile } from '@/features/tools/tools/_shared/pdf/core/types';
import { loadPdfFile } from '@/features/tools/tools/_shared/pdf/core/shared/file';
import { mapPdfError } from '@/features/tools/tools/_shared/pdf/core/shared/errors';
import { receiveWindowFileHandoff, useFileHandoff } from '@/core/browser/file-handoff';

export interface FileLoadError {
  name: string;
  message: string;
}

export function usePdfFiles() {
  const files = shallowRef<LoadedPdfFile[]>([]);
  const loading = ref(false);
  const errors = ref<FileLoadError[]>([]);
  const { take } = useFileHandoff();
  let stopWindowFileHandoff: () => void = () => undefined;

  async function addFiles(selectedFiles: File[] | FileList): Promise<void> {
    loading.value = true;
    errors.value = [];

    try {
      for (const file of Array.from(selectedFiles)) {
        if (
          files.value.some((current) => current.name === file.name && current.size === file.size)
        ) {
          errors.value.push({ name: file.name, message: '这个文件已经添加过了。' });
          continue;
        }

        try {
          const loaded = await loadPdfFile(file);
          files.value = [...files.value, loaded];
        } catch (error) {
          errors.value.push({
            name: file.name,
            message: mapPdfError(error).message,
          });
        }
      }
    } finally {
      loading.value = false;
    }
  }

  function removeFile(id: string): void {
    files.value = files.value.filter((file) => file.id !== id);
  }

  function clearFiles(): void {
    files.value = [];
    errors.value = [];
  }

  function replaceFiles(nextFiles: LoadedPdfFile[]): void {
    files.value = nextFiles;
  }

  onMounted(() => {
    const handoff = take('pdf');
    if (handoff) {
      void addFiles([handoff]);
    }
    stopWindowFileHandoff = receiveWindowFileHandoff('pdf', (file) => {
      void addFiles([file]);
    });
  });

  onBeforeUnmount(() => stopWindowFileHandoff());

  return {
    files,
    loading: readonly(loading),
    errors: readonly(errors),
    addFiles,
    removeFile,
    clearFiles,
    replaceFiles,
  };
}
