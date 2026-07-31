import { computed, onBeforeUnmount, ref } from "vue";

import {
  getOutputFilename,
  processImage,
  readImageDimensions,
} from "@/core/image";
import type { ImageTask, RenderSpec, ZipEntry } from "@/types/image";
import { createZip } from "@/utils/zip";

const PROCESS_CONCURRENCY = 2;

export type RenderSpecFactory = (
  task: ImageTask,
) => RenderSpec | Promise<RenderSpec>;

export interface ProcessAllOptions {
  suffix?: string | ((task: ImageTask) => string);
}

let fallbackId = 0;

function createTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  fallbackId += 1;
  return `image-${Date.now()}-${fallbackId}`;
}

function createPreviewUrl(file: File): string {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return "";
  }

  return URL.createObjectURL(file);
}

function revokePreviewUrl(url: string): void {
  if (
    url &&
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  if (error instanceof RangeError && error.message === "IMAGE_TOO_LARGE") {
    return "图片像素尺寸过大（最长边限 32768 px、总像素限 5000 万），为避免浏览器内存不足，未载入该文件。";
  }
  return error instanceof Error ? error.message : "图片处理失败";
}

async function runPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PROCESS_CONCURRENCY, items.length) },
      () => consume(),
    ),
  );
}

export function useImageWorkspace() {
  const tasks = ref<ImageTask[]>([]);
  const activeController = ref<AbortController | null>(null);

  const isProcessing = computed(() => activeController.value !== null);
  const readyCount = computed(
    () => tasks.value.filter((task) => task.status === "ready").length,
  );
  const completedCount = computed(
    () => tasks.value.filter((task) => task.status === "success").length,
  );
  const resultEntries = computed<ZipEntry[]>(() => {
    const entries: ZipEntry[] = [];
    const usedNames = new Set<string>();

    for (const task of tasks.value) {
      if (!task.result) {
        continue;
      }

      const originalName = task.result.filename;
      const dotIndex = originalName.lastIndexOf(".");
      const stem =
        dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
      const extension = dotIndex > 0 ? originalName.slice(dotIndex) : "";
      let name = originalName;
      let duplicateIndex = 2;

      while (usedNames.has(name.toLowerCase())) {
        name = `${stem}-${duplicateIndex}${extension}`;
        duplicateIndex += 1;
      }

      usedNames.add(name.toLowerCase());
      entries.push({ name, blob: task.result.blob });
    }

    return entries;
  });

  async function addFiles(files: FileList | Iterable<File>): Promise<ImageTask[]> {
    const addedTasks = Array.from(files, (file): ImageTask => ({
      id: createTaskId(),
      file,
      previewUrl: createPreviewUrl(file),
      status: "ready",
      progress: 0,
      width: 0,
      height: 0,
    }));

    const startIndex = tasks.value.length;
    tasks.value.push(...addedTasks);
    const queuedTasks = tasks.value.slice(startIndex);

    await runPool(queuedTasks, async (task) => {
      try {
        const dimensions = await readImageDimensions(task.file);
        task.width = dimensions.width;
        task.height = dimensions.height;
      } catch (error) {
        task.status = "failed";
        task.error = errorMessage(error);
      }
    });

    return queuedTasks;
  }

  function removeTask(id: string): void {
    const index = tasks.value.findIndex((task) => task.id === id);
    if (index < 0) {
      return;
    }

    const [removed] = tasks.value.splice(index, 1);
    if (removed) {
      revokePreviewUrl(removed.previewUrl);
    }
  }

  function resetTask(task: ImageTask): void {
    task.status = "ready";
    task.progress = 0;
    task.error = undefined;
    task.result = undefined;
  }

  function resetAll(): void {
    if (isProcessing.value) {
      return;
    }

    for (const task of tasks.value) {
      if (task.width > 0 && task.height > 0) {
        resetTask(task);
      }
    }
  }

  function cancel(): void {
    if (!activeController.value) {
      return;
    }

    activeController.value.abort();
    for (const task of tasks.value) {
      if (task.status === "processing" || task.status === "ready") {
        task.status = "cancelled";
        task.progress = 0;
      }
    }
  }

  function clear(): void {
    cancel();
    for (const task of tasks.value) {
      revokePreviewUrl(task.previewUrl);
    }
    tasks.value = [];
  }

  async function processAll(
    specOrFactory: RenderSpec | RenderSpecFactory,
    options: ProcessAllOptions = {},
  ): Promise<void> {
    if (activeController.value) {
      throw new Error("已有批处理任务正在运行");
    }

    const candidates = tasks.value.filter(
      (task) => task.width > 0 && task.height > 0,
    );
    if (candidates.length === 0) {
      return;
    }

    for (const task of candidates) {
      resetTask(task);
    }

    const controller = new AbortController();
    activeController.value = controller;

    try {
      await runPool(candidates, async (task) => {
        if (controller.signal.aborted) {
          task.status = "cancelled";
          return;
        }

        task.status = "processing";
        task.progress = 10;

        try {
          const spec =
            typeof specOrFactory === "function"
              ? await specOrFactory(task)
              : specOrFactory;
          const result = await processImage(task.file, spec, controller.signal);
          const suffix =
            typeof options.suffix === "function"
              ? options.suffix(task)
              : (options.suffix ?? "");

          task.result = {
            ...result,
            filename: getOutputFilename(task.file.name, result.mime, suffix),
          };
          task.status = "success";
          task.progress = 100;
        } catch (error) {
          task.result = undefined;
          task.progress = 0;
          if (isAbortError(error) || controller.signal.aborted) {
            task.status = "cancelled";
          } else {
            task.status = "failed";
            task.error = errorMessage(error);
          }
        }
      });
    } finally {
      if (activeController.value === controller) {
        activeController.value = null;
      }
    }
  }

  function createResultsZip(signal?: AbortSignal): Promise<Blob> {
    return createZip(resultEntries.value, signal);
  }

  onBeforeUnmount(clear);

  return {
    tasks,
    isProcessing,
    readyCount,
    completedCount,
    resultEntries,
    addFiles,
    removeTask,
    resetAll,
    clear,
    cancel,
    processAll,
    createResultsZip,
  };
}
