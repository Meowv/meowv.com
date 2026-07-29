<script setup lang="ts">
import { ShieldCheck } from "@lucide/vue";
</script>

<template>
  <aside class="privacy-notice" aria-label="隐私说明">
    <span class="privacy-notice__icon" aria-hidden="true">
      <ShieldCheck :size="21" :stroke-width="1.8" />
    </span>
    <div>
      <strong>数据仅保存在当前浏览器</strong>
      <p>
        所有表格内容均在本地处理，不会上传到服务器。清理浏览器数据或更换设备后可能无法恢复，请定期导出备份。
      </p>
    </div>
  </aside>
</template>

<style scoped>
.privacy-notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--primary-surface);
  color: var(--primary-text);
}

.privacy-notice__icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  background: var(--primary-surface-strong);
  color: var(--primary-text);
}

.privacy-notice strong {
  display: block;
  color: var(--primary-text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.5;
}

.privacy-notice p {
  margin: 3px 0 0;
  color: var(--primary-text-soft);
  font-size: 13px;
  line-height: 1.6;
}
</style>
