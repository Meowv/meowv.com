import type { LoadedPdfFile } from "@pdf/types";
import { loadPdfFile } from "@pdf/shared/file";
import { mapPdfError } from "@pdf/shared/errors";

export interface FileLoadError {
  name: string;
  message: string;
}

export function usePdfFiles() {
  const files = shallowRef<LoadedPdfFile[]>([]);
  const loading = ref(false);
  const errors = ref<FileLoadError[]>([]);

  async function addFiles(selectedFiles: File[] | FileList): Promise<void> {
    loading.value = true;
    errors.value = [];

    try {
      for (const file of Array.from(selectedFiles)) {
        if (
          files.value.some((current) => current.name === file.name && current.size === file.size)
        ) {
          errors.value.push({ name: file.name, message: "这个文件已经添加过了。" });
          continue;
        }

        try {
          const loaded = await loadPdfFile(file);
          files.value = [...files.value, loaded];
        } catch (error) {
          errors.value.push({
            name: file.name,
            message: mapPdfError(error).message
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

  return {
    files,
    loading: readonly(loading),
    errors: readonly(errors),
    addFiles,
    removeFile,
    clearFiles,
    replaceFiles
  };
}
