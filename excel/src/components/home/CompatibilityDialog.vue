<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "@lucide/vue";
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

import type { CompatibilityReport } from "@/types/normalized-workbook";

const props = defineProps<{
  open: boolean;
  fileName: string;
  report: CompatibilityReport | null;
}>();

const emit = defineEmits<{
  close: [];
  openWorkbook: [];
  "update:open": [value: boolean];
}>();

const dialogRef = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

const close = () => {
  emit("update:open", false);
  emit("close");
};

const onKeydown = (event: KeyboardEvent) => {
  if (props.open && event.key === "Escape") {
    event.preventDefault();
    close();
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      dialogRef.value?.querySelector<HTMLElement>(".primary-button")?.focus();
    } else {
      document.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
      previousFocus = null;
    }
  },
);

onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="compatibility-fade">
      <div v-if="open && report" class="compatibility-backdrop" @mousedown.self="close">
        <section
          ref="dialogRef"
          class="compatibility-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compatibility-title"
        >
          <header>
            <div>
              <span
                class="compatibility-dialog__status"
                :class="{ warning: report.hasWarnings }"
                aria-hidden="true"
              >
                <AlertTriangle v-if="report.hasWarnings" :size="22" />
                <CheckCircle2 v-else :size="22" />
              </span>
              <div>
                <h2 id="compatibility-title">
                  {{ report.hasWarnings ? "文件已导入，部分内容可能有差异" : "文件已成功导入" }}
                </h2>
                <p>{{ fileName }} · {{ report.engine }}</p>
              </div>
            </div>
            <button type="button" aria-label="关闭报告" @click="close"><X :size="19" /></button>
          </header>

          <div class="compatibility-dialog__body">
            <p class="summary">{{ report.summary }}</p>
            <div class="compatibility-counts" aria-label="兼容性统计">
              <span class="preserved">
                <CheckCircle2 :size="16" />
                {{ report.preserved.length }} 项保留
              </span>
              <span class="degraded">
                <AlertTriangle :size="16" />
                {{ report.degraded.length }} 项降级
              </span>
              <span class="unsupported">
                <XCircle :size="16" />
                {{ report.unsupported.length }} 项不支持
              </span>
            </div>

            <div class="report-sections">
              <section>
                <h3><CheckCircle2 :size="17" />已保留</h3>
                <ul v-if="report.preserved.length">
                  <li v-for="item in report.preserved" :key="item">{{ item }}</li>
                </ul>
                <p v-else>报告中没有列出可确认保留的项目。</p>
              </section>
              <section :class="{ highlighted: report.degraded.length }">
                <h3><AlertTriangle :size="17" />降级处理</h3>
                <ul v-if="report.degraded.length">
                  <li v-for="item in report.degraded" :key="item">{{ item }}</li>
                </ul>
                <p v-else>没有检测到需要降级处理的项目。</p>
              </section>
              <section :class="{ highlighted: report.unsupported.length }">
                <h3><XCircle :size="17" />暂不支持</h3>
                <ul v-if="report.unsupported.length">
                  <li v-for="item in report.unsupported" :key="item">{{ item }}</li>
                </ul>
                <p v-else>没有检测到明确不支持的项目。</p>
              </section>
            </div>

            <details v-if="report.issues.length || report.ignored.length">
              <summary><Info :size="16" />查看技术明细</summary>
              <ul>
                <li v-for="issue in report.issues" :key="`${issue.code}-${issue.detail}`">
                  <strong>{{ issue.feature }}</strong
                  >：{{ issue.detail }}
                </li>
                <li v-for="item in report.ignored" :key="`ignored-${item}`">
                  <strong>已忽略</strong>：{{ item }}
                </li>
              </ul>
            </details>

            <p class="compatibility-note">
              建议打开后核对公式、合并单元格和复杂样式；原始文件不会被修改。
            </p>
          </div>

          <footer>
            <button class="secondary-button" type="button" @click="close">稍后打开</button>
            <button class="primary-button" type="button" @click="$emit('openWorkbook')">
              打开工作簿
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.compatibility-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: var(--backdrop);
}

.compatibility-dialog {
  width: min(720px, 100%);
  max-height: min(780px, calc(100dvh - 48px));
  overflow: hidden auto;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 18px 54px rgb(20 33 25 / 16%);
  color: var(--text);
}

.compatibility-dialog > header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.compatibility-dialog > header > div {
  display: flex;
  align-items: center;
  gap: 11px;
}

.compatibility-dialog__status {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 7px;
  background: var(--primary-surface-strong);
  color: var(--primary-text);
  place-items: center;
}

.compatibility-dialog__status.warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.compatibility-dialog h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 680;
  line-height: 1.4;
}

.compatibility-dialog header p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.compatibility-dialog header button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  place-items: center;
}

.compatibility-dialog header button:hover {
  background: var(--surface-hover);
}

.compatibility-dialog__body {
  padding: 20px 22px;
}

.summary {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.compatibility-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 15px 0 18px;
}

.compatibility-counts span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 620;
}

.compatibility-counts .preserved {
  border-color: var(--primary-border);
  background: var(--primary-surface);
  color: var(--primary-text);
}

.compatibility-counts .degraded {
  border-color: var(--warning-border);
  background: var(--warning-surface);
  color: var(--warning-text);
}

.compatibility-counts .unsupported {
  border-color: var(--danger-border);
  background: var(--danger-surface);
  color: var(--danger-text);
}

.report-sections {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.report-sections section {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.report-sections section.highlighted {
  border-color: var(--warning-border);
  background: var(--warning-surface);
}

.report-sections h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 9px;
  color: var(--text);
  font-size: 12px;
  font-weight: 680;
}

.report-sections ul,
.report-sections p,
details ul {
  margin: 0;
  padding: 0 0 0 17px;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.65;
}

.report-sections p {
  padding: 0;
}

details {
  margin-top: 13px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

details summary {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

details ul {
  margin-top: 9px;
}

.compatibility-note {
  margin: 15px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.6;
}

.compatibility-dialog > footer {
  position: sticky;
  z-index: 2;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.primary-button,
.secondary-button {
  height: 38px;
  padding: 0 15px;
  border: 1px solid var(--primary-600);
  border-radius: 6px;
  background: var(--primary-600);
  color: var(--on-accent);
  font: inherit;
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
}

.secondary-button {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text-secondary);
}

.primary-button:hover {
  background: var(--primary-700);
}

.secondary-button:hover {
  background: var(--surface-muted);
}

button:focus-visible,
summary:focus-visible {
  outline: 3px solid rgb(22 163 74 / 18%);
  outline-offset: 2px;
}

.compatibility-fade-enter-active,
.compatibility-fade-leave-active {
  transition: opacity 160ms ease;
}

.compatibility-fade-enter-from,
.compatibility-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .compatibility-backdrop {
    padding: 12px;
  }

  .report-sections {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .compatibility-fade-enter-active,
  .compatibility-fade-leave-active {
    transition: none;
  }
}
</style>
