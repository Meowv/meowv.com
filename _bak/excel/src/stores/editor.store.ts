import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export const useEditorStore = defineStore("editor", () => {
  const workbookId = ref("");
  const workbookName = ref("");
  const saveStatus = ref<SaveStatus>("idle");
  const saveError = ref("");
  const isImporting = ref(false);
  const isExporting = ref(false);
  const operationLabel = ref("");
  const operationProgress = ref<number | null>(null);

  const saveStatusText = computed(() => {
    switch (saveStatus.value) {
      case "dirty":
        return "有未保存的更改";
      case "saving":
        return "正在保存…";
      case "saved":
        return "已保存";
      case "error":
        return "保存失败";
      default:
        return "仅保存在此设备";
    }
  });

  function setWorkbook(id: string, name: string) {
    workbookId.value = id;
    workbookName.value = name;
  }

  function setDirty() {
    saveStatus.value = "dirty";
    saveError.value = "";
  }

  function setSaving() {
    saveStatus.value = "saving";
    saveError.value = "";
  }

  function setSaved() {
    saveStatus.value = "saved";
    saveError.value = "";
  }

  function setSaveError(error: unknown) {
    saveStatus.value = "error";
    saveError.value = error instanceof Error ? error.message : "无法写入浏览器本地存储";
  }

  function setOperation(label: string, progress: number | null = null) {
    operationLabel.value = label;
    operationProgress.value = progress;
  }

  return {
    workbookId,
    workbookName,
    saveStatus,
    saveError,
    saveStatusText,
    isImporting,
    isExporting,
    operationLabel,
    operationProgress,
    setWorkbook,
    setDirty,
    setSaving,
    setSaved,
    setSaveError,
    setOperation,
  };
});
