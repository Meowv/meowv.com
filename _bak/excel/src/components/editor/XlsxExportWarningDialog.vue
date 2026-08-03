<script setup lang="ts">
import { ShieldCheck } from "@lucide/vue";

import EditorDialog from "./EditorDialog.vue";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  backup: [];
  confirm: [];
}>();

function close() {
  emit("update:open", false);
}

function chooseBackup() {
  close();
  emit("backup");
}

function confirmExport() {
  close();
  emit("confirm");
}
</script>

<template>
  <EditorDialog
    :open="open"
    title="导出 XLSX 前请确认"
    description="XLSX 适合交换基础表格内容，但无法无损保留本应用中的全部编辑能力。"
    width="620px"
    @close="close"
  >
    <div class="export-warning">
      <p>以下内容会尽力导出：</p>
      <ul>
        <li>单元格值、基础类型、公式、合并区域、行高列宽和常见数字格式。</li>
      </ul>
      <p>以下内容可能降级或丢失：</p>
      <ul>
        <li>数据验证、条件格式、筛选设置、绘图与图片，以及部分高级样式。</li>
      </ul>
      <div class="local-only-note">
        <ShieldCheck :size="19" />
        <span>建议同时导出 `.msheet` 完整备份，便于在本应用中恢复。</span>
      </div>
    </div>
    <template #footer>
      <button class="button button--secondary" type="button" @click="close">取消</button>
      <button class="button button--secondary" type="button" @click="chooseBackup">
        先导出完整备份
      </button>
      <button class="button button--primary" type="button" @click="confirmExport">
        继续导出 XLSX
      </button>
    </template>
  </EditorDialog>
</template>

<style scoped>
.export-warning {
  display: grid;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.export-warning p,
.export-warning ul {
  margin: 0;
}

.export-warning ul {
  padding-left: 20px;
}

.local-only-note {
  display: flex;
  align-items: center;
  gap: 9px;
}

.local-only-note svg {
  flex: none;
}
</style>
