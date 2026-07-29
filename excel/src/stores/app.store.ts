import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type ToastType = "success" | "error" | "info";

export interface AppToast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}

export interface ImportActivity {
  active: boolean;
  fileName: string;
  fileSize: number;
  stage: string;
  progress: number | null;
}

const idleImport: ImportActivity = {
  active: false,
  fileName: "",
  fileSize: 0,
  stage: "",
  progress: null,
};

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const useAppStore = defineStore("app", () => {
  const importActivity = ref<ImportActivity>({ ...idleImport });
  const isExporting = ref(false);
  const toasts = ref<AppToast[]>([]);
  const isBusy = computed(() => importActivity.value.active || isExporting.value);

  function beginImport(file: File) {
    importActivity.value = {
      active: true,
      fileName: file.name,
      fileSize: file.size,
      stage: "正在读取文件",
      progress: 0,
    };
  }

  function updateImport(progress: number | null, stage?: string) {
    if (!importActivity.value.active) return;
    importActivity.value = {
      ...importActivity.value,
      progress: progress === null ? null : Math.max(0, Math.min(100, progress)),
      stage: stage ?? importActivity.value.stage,
    };
  }

  function finishImport() {
    importActivity.value = { ...idleImport };
  }

  function pushToast(
    title: string,
    options: {
      message?: string;
      type?: ToastType;
      duration?: number;
    } = {},
  ) {
    const toast: AppToast = {
      id: createId(),
      title,
      message: options.message,
      type: options.type ?? "info",
    };
    toasts.value.push(toast);

    const duration = options.duration ?? 4200;
    if (duration > 0) {
      globalThis.setTimeout(() => dismissToast(toast.id), duration);
    }
    return toast.id;
  }

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function errorMessage(error: unknown, fallback = "操作未完成") {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  }

  return {
    importActivity,
    isBusy,
    isExporting,
    toasts,
    beginImport,
    dismissToast,
    errorMessage,
    finishImport,
    pushToast,
    updateImport,
  };
});
