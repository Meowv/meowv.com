<script setup lang="ts">
import {
  ArrowLeft,
  Check,
  Database,
  Download,
  HandCoins,
  HardDrive,
  History,
  Info,
  Monitor,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  Trash2,
  Upload,
} from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

import AppLogo from "@/components/common/AppLogo.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import PrivacyNotice from "@/components/common/PrivacyNotice.vue";
import ToastRegion from "@/components/common/ToastRegion.vue";
import { backupService } from "@/services/backup.service";
import { downloadExport } from "@/services/export.service";
import { disableOfflineSupport } from "@/services/pwa.service";
import { useAppStore } from "@/stores/app.store";
import {
  useSettingsStore,
  type EditableAppSettings,
  type ThemeMode,
} from "@/stores/settings.store";
import { useWorkbookStore } from "@/stores/workbook.store";

type NumericKey =
  "autoSaveDelay" | "maxAutoRevisions" | "defaultFontSize" | "createRevisionInterval";

const appStore = useAppStore();
const settingsStore = useSettingsStore();
const workbookStore = useWorkbookStore();

const backupInput = ref<HTMLInputElement | null>(null);
const pendingBackup = ref<File | null>(null);
const importBackupOpen = ref(false);
const clearAllOpen = ref(false);
const working = ref<"backup-export" | "backup-import" | "cache" | null>(null);

const settings = computed(() => settingsStore.settings);

const themes: Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "浅色", description: "始终使用明亮界面", icon: Sun },
  { value: "dark", label: "深色", description: "始终使用深色界面", icon: Moon },
  { value: "system", label: "跟随系统", description: "与设备外观保持一致", icon: Monitor },
];

async function updateSettings(patch: Partial<EditableAppSettings>) {
  try {
    await settingsStore.update(patch);
    if (patch.enablePwa === false) {
      await disableOfflineSupport();
      appStore.pushToast("离线模式已关闭", {
        message: "应用缓存和 Service Worker 已移除，本地工作簿不会受影响。",
        type: "success",
      });
    }
  } catch (error) {
    appStore.pushToast("设置保存失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

function updateNumber(key: NumericKey, value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  void updateSettings({ [key]: Math.max(minimum, Math.min(maximum, parsed)) });
}

async function resetSettings() {
  try {
    await settingsStore.reset();
    appStore.pushToast("已恢复默认设置", { type: "success" });
  } catch (error) {
    appStore.pushToast("无法恢复默认设置", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

async function clearAppCache() {
  working.value = "cache";
  try {
    if (!("caches" in window)) {
      throw new Error("当前浏览器不支持缓存管理。");
    }
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    appStore.pushToast("应用缓存已清除", {
      message: "工作簿和设置未被删除。",
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("清除缓存失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    working.value = null;
  }
}

async function exportBackup() {
  working.value = "backup-export";
  try {
    const result = await backupService.exportAllLocalData({
      onProgress: (progress) => {
        if (progress.percent === 100) return;
      },
    });
    downloadExport(result);
    appStore.pushToast("备份已开始下载", {
      message: "请妥善保管备份文件。",
      type: "success",
    });
  } catch (error) {
    appStore.pushToast("导出备份失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  } finally {
    working.value = null;
  }
}

function selectBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  pendingBackup.value = file;
  importBackupOpen.value = true;
}

async function importBackup() {
  if (!pendingBackup.value) return;
  working.value = "backup-import";
  try {
    const result = await backupService.importAllLocalData(pendingBackup.value, {
      onProgress: (progress) => {
        if (progress.percent === 100) return;
      },
    });
    await workbookStore.refresh();
    await settingsStore.load();
    if (!settingsStore.settings.enablePwa) await disableOfflineSupport();
    importBackupOpen.value = false;
    appStore.pushToast("本地备份已导入", {
      message: `恢复 ${result.workbookCount} 个工作簿、${result.revisionCount} 个版本和 ${result.assetCount} 个资源。`,
      type: "success",
      duration: 6500,
    });
  } catch (error) {
    appStore.pushToast("导入备份失败", {
      message: appStore.errorMessage(error, "请确认所选文件是由本应用导出的备份。"),
      type: "error",
      duration: 7000,
    });
  } finally {
    pendingBackup.value = null;
    if (backupInput.value) backupInput.value.value = "";
    working.value = null;
  }
}

function cancelBackupImport() {
  pendingBackup.value = null;
  if (backupInput.value) backupInput.value.value = "";
}

async function clearAllData() {
  try {
    await workbookStore.clearAll();
    await settingsStore.load();
    clearAllOpen.value = false;
    appStore.pushToast("所有本地数据已清除", { type: "success" });
  } catch (error) {
    appStore.pushToast("清除失败", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
}

onMounted(async () => {
  try {
    await settingsStore.load();
    await workbookStore.refresh();
  } catch (error) {
    appStore.pushToast("无法读取本地设置", {
      message: appStore.errorMessage(error),
      type: "error",
    });
  }
});
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <AppLogo compact />
      <RouterLink class="back-link" to="/">
        <ArrowLeft :size="18" />
        返回工作簿
      </RouterLink>
    </header>

    <main>
      <aside class="settings-nav">
        <div>
          <span class="settings-nav__label">设置</span>
          <a href="#appearance"><Sun :size="17" />外观</a>
          <a href="#editing"><Settings2 :size="17" />编辑与保存</a>
          <a href="#history"><History :size="17" />历史版本</a>
          <a href="#data"><Database :size="17" />本地数据</a>
          <a href="#privacy"><Info :size="17" />隐私说明</a>
          <a href="#support"><HandCoins :size="17" />捐赠支持</a>
        </div>
        <button type="button" @click="resetSettings">
          <RotateCcw :size="16" />
          恢复默认设置
        </button>
      </aside>

      <div class="settings-content">
        <div class="page-title">
          <span><Settings2 :size="21" /></span>
          <div>
            <h1>设置</h1>
            <p>偏好设置和工作簿一样，只保存在当前浏览器。</p>
          </div>
          <span v-if="settingsStore.saving" class="saving-status">正在保存…</span>
          <span v-else-if="settingsStore.loaded" class="saved-status">
            <Check :size="14" />
            已保存
          </span>
        </div>

        <section id="appearance" class="settings-section">
          <div class="section-heading">
            <h2>外观</h2>
            <p>选择最适合当前环境的界面主题。</p>
          </div>
          <div class="theme-grid">
            <button
              v-for="theme in themes"
              :key="theme.value"
              type="button"
              :class="{ selected: settings.theme === theme.value }"
              :aria-pressed="settings.theme === theme.value"
              @click="updateSettings({ theme: theme.value })"
            >
              <span class="theme-icon"><component :is="theme.icon" :size="21" /></span>
              <span>
                <strong>{{ theme.label }}</strong>
                <small>{{ theme.description }}</small>
              </span>
              <Check v-if="settings.theme === theme.value" class="theme-check" :size="17" />
            </button>
          </div>
        </section>

        <section id="editing" class="settings-section">
          <div class="section-heading">
            <h2>编辑与保存</h2>
            <p>控制自动保存和表格编辑器的默认显示方式。</p>
            <p>浏览器隐私模式或清理站点数据可能导致工作簿丢失。重要文件请定期导出到电脑。</p>
          </div>
          <div class="setting-list">
            <div class="setting-row">
              <div>
                <strong>自动保存</strong>
                <p>编辑后自动将工作簿写入当前浏览器。</p>
              </div>
              <button
                class="switch"
                type="button"
                role="switch"
                :aria-checked="settings.autoSave"
                :class="{ enabled: settings.autoSave }"
                @click="updateSettings({ autoSave: !settings.autoSave })"
              >
                <span />
              </button>
            </div>
            <label class="setting-row" :class="{ disabled: !settings.autoSave }">
              <div>
                <strong>自动保存间隔</strong>
                <p>停止输入后等待多久开始保存。</p>
              </div>
              <select
                :value="settings.autoSaveDelay"
                :disabled="!settings.autoSave"
                @change="
                  updateNumber(
                    'autoSaveDelay',
                    ($event.target as HTMLSelectElement).value,
                    500,
                    10000,
                  )
                "
              >
                <option :value="500">0.5 秒</option>
                <option :value="1000">1 秒</option>
                <option :value="1500">1.5 秒（推荐）</option>
                <option :value="3000">3 秒</option>
                <option :value="5000">5 秒</option>
              </select>
            </label>
            <label class="setting-row">
              <div>
                <strong>默认字号</strong>
                <p>新建单元格内容的默认字体大小。</p>
              </div>
              <select
                :value="settings.defaultFontSize"
                @change="
                  updateNumber('defaultFontSize', ($event.target as HTMLSelectElement).value, 8, 24)
                "
              >
                <option v-for="size in [9, 10, 11, 12, 14, 16, 18]" :key="size" :value="size">
                  {{ size }} px
                </option>
              </select>
            </label>
            <div class="setting-row">
              <div>
                <strong>显示网格线</strong>
                <p>默认在工作表中显示单元格边界。</p>
              </div>
              <button
                class="switch"
                type="button"
                role="switch"
                :aria-checked="settings.showGridlines"
                :class="{ enabled: settings.showGridlines }"
                @click="updateSettings({ showGridlines: !settings.showGridlines })"
              >
                <span />
              </button>
            </div>
            <div class="setting-row">
              <div>
                <strong>显示公式栏</strong>
                <p>在编辑器顶部显示名称框和公式输入栏。</p>
              </div>
              <button
                class="switch"
                type="button"
                role="switch"
                :aria-checked="settings.showFormulaBar"
                :class="{ enabled: settings.showFormulaBar }"
                @click="updateSettings({ showFormulaBar: !settings.showFormulaBar })"
              >
                <span />
              </button>
            </div>
            <div class="setting-row">
              <div>
                <strong>显示状态栏</strong>
                <p>显示选区计数、求和与平均值。</p>
              </div>
              <button
                class="switch"
                type="button"
                role="switch"
                :aria-checked="settings.showStatusBar"
                :class="{ enabled: settings.showStatusBar }"
                @click="updateSettings({ showStatusBar: !settings.showStatusBar })"
              >
                <span />
              </button>
            </div>
            <div class="setting-row">
              <div>
                <strong>离线模式</strong>
                <p>缓存应用资源，以便断网时继续打开。</p>
              </div>
              <button
                class="switch"
                type="button"
                role="switch"
                :aria-checked="settings.enablePwa"
                :class="{ enabled: settings.enablePwa }"
                @click="updateSettings({ enablePwa: !settings.enablePwa })"
              >
                <span />
              </button>
            </div>
          </div>
        </section>

        <section id="history" class="settings-section">
          <div class="section-heading">
            <h2>历史版本</h2>
            <p>控制系统自动保留的本地版本数量和生成频率。</p>
          </div>
          <div class="setting-list">
            <label class="setting-row">
              <div>
                <strong>自动版本数量</strong>
                <p>超过数量后会优先删除最早的自动版本。</p>
              </div>
              <select
                :value="settings.maxAutoRevisions"
                @change="
                  updateNumber(
                    'maxAutoRevisions',
                    ($event.target as HTMLSelectElement).value,
                    5,
                    100,
                  )
                "
              >
                <option :value="10">10 个</option>
                <option :value="20">20 个（推荐）</option>
                <option :value="30">30 个</option>
                <option :value="50">50 个</option>
              </select>
            </label>
            <label class="setting-row">
              <div>
                <strong>自动版本间隔</strong>
                <p>连续编辑时创建一个可恢复版本的频率。</p>
              </div>
              <select
                :value="settings.createRevisionInterval"
                @change="
                  updateNumber(
                    'createRevisionInterval',
                    ($event.target as HTMLSelectElement).value,
                    60000,
                    1800000,
                  )
                "
              >
                <option :value="60000">1 分钟</option>
                <option :value="300000">5 分钟（推荐）</option>
                <option :value="600000">10 分钟</option>
                <option :value="1800000">30 分钟</option>
              </select>
            </label>
          </div>
        </section>

        <section id="data" class="settings-section">
          <div class="section-heading">
            <h2>本地数据</h2>
            <p>管理当前浏览器中的工作簿、备份和应用缓存。</p>
          </div>
          <div class="storage-summary">
            <span><HardDrive :size="22" /></span>
            <div>
              <strong>{{ workbookStore.workbooks.length }} 个本地工作簿</strong>
              <p>
                另有 {{ workbookStore.trashedWorkbooks.length }} 个工作簿位于回收站。内容存储在
                IndexedDB。
              </p>
            </div>
          </div>
          <div class="data-actions">
            <div>
              <span class="data-actions__icon"><Download :size="19" /></span>
              <div>
                <strong>导出全部本地数据</strong>
                <p>下载包含工作簿、历史版本和资源的应用备份。</p>
              </div>
              <button
                class="secondary-button"
                type="button"
                :disabled="working !== null"
                @click="exportBackup"
              >
                {{ working === "backup-export" ? "正在导出…" : "导出备份" }}
              </button>
            </div>
            <div>
              <span class="data-actions__icon"><Upload :size="19" /></span>
              <div>
                <strong>导入应用备份</strong>
                <p>从先前导出的备份文件恢复到当前浏览器。</p>
              </div>
              <button
                class="secondary-button"
                type="button"
                :disabled="working !== null"
                @click="backupInput?.click()"
              >
                选择备份
              </button>
            </div>
            <div>
              <span class="data-actions__icon"><RotateCcw :size="19" /></span>
              <div>
                <strong>清除应用缓存</strong>
                <p>移除离线资源，不会删除工作簿和设置。</p>
              </div>
              <button
                class="secondary-button"
                type="button"
                :disabled="working !== null"
                @click="clearAppCache"
              >
                {{ working === "cache" ? "正在清除…" : "清除缓存" }}
              </button>
            </div>
            <div class="data-actions__danger">
              <span class="data-actions__icon"><Trash2 :size="19" /></span>
              <div>
                <strong>清除所有本地数据</strong>
                <p>永久删除工作簿、历史版本、资源和用户设置。</p>
              </div>
              <button class="danger-button" type="button" @click="clearAllOpen = true">
                清除全部
              </button>
            </div>
          </div>
          <input
            ref="backupInput"
            class="visually-hidden"
            type="file"
            accept=".msheet,.json,application/json"
            @change="selectBackup"
          />
        </section>

        <section id="privacy" class="settings-section privacy-panel">
          <div class="section-heading">
            <h2>隐私说明</h2>
            <p>我们如何处理你的文件和表格内容。</p>
          </div>
          <PrivacyNotice />
          <ul>
            <li>所有导入、编辑和导出均在当前设备完成，不调用第三方文件转换接口。</li>
            <li>应用不会执行工作簿中的宏、VBA 或内嵌脚本。</li>
            <li>使用隐私模式、清理浏览器数据或更换设备，可能导致本地工作簿无法恢复。</li>
          </ul>
        </section>

        <section id="support" class="settings-section support-panel">
          <div class="section-heading">
            <h2>捐赠支持</h2>
            <p>感谢你的支持，它将用于在线 Excel 处理的持续维护。</p>
          </div>
          <div class="support-panel__payments">
            <figure>
              <img src="https://meowv.com/medias/reward/alipay.png" alt="支付宝收款二维码" />
              <figcaption>支付宝</figcaption>
            </figure>
            <figure>
              <img src="https://meowv.com/medias/reward/wechat.png" alt="微信收款二维码" />
              <figcaption>微信</figcaption>
            </figure>
          </div>
        </section>
      </div>
    </main>

    <ConfirmDialog
      v-model:open="importBackupOpen"
      title="导入本地备份？"
      :description="`将从“${pendingBackup?.name ?? ''}”恢复数据。同 ID 的本地记录可能被备份内容覆盖。`"
      confirm-label="导入备份"
      @cancel="cancelBackupImport"
      @confirm="importBackup"
    />
    <ConfirmDialog
      v-model:open="clearAllOpen"
      title="清除所有本地数据？"
      description="工作簿、回收站内容、历史版本、资源和设置将被永久删除。应用离线缓存不会被删除。"
      confirm-label="清除所有本地数据"
      required-text="清除"
      dangerous
      @confirm="clearAllData"
    />
    <ToastRegion :toasts="appStore.toasts" @dismiss="appStore.dismissToast" />
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100dvh;
  background: var(--app-bg);
  color: var(--text-strong);
}

.settings-header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  height: 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(22px, 4vw, 56px);
  border-bottom: 1px solid var(--border);
  background: var(--surface-translucent);
}

.back-link {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  background: var(--surface-muted);
}

main {
  display: grid;
  width: min(1080px, calc(100% - 48px));
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 44px;
  margin: 0 auto;
  padding: 42px 0 80px;
}

.settings-nav {
  position: sticky;
  top: 94px;
  display: flex;
  height: calc(100dvh - 126px);
  flex-direction: column;
  justify-content: space-between;
  align-self: start;
}

.settings-nav__label {
  display: block;
  margin: 0 10px 11px;
  color: var(--text-disabled);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.settings-nav a {
  display: flex;
  height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 11px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 570;
  text-decoration: none;
}

.settings-nav a:hover {
  background: var(--surface-hover);
  color: var(--primary-text);
}

.settings-nav button {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.settings-nav button:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.settings-content {
  min-width: 0;
}

.page-title {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  margin-bottom: 26px;
}

.page-title > span:first-child {
  display: grid;
  width: 42px;
  height: 42px;
  border: 1px solid var(--primary-border);
  border-radius: 8px;
  background: var(--primary-surface);
  color: var(--primary-text);
  place-items: center;
}

.page-title h1 {
  margin: 0;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.page-title p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.saving-status,
.saved-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.saved-status {
  color: var(--primary-text);
}

.settings-section {
  margin-bottom: 20px;
  scroll-margin-top: 86px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}

.section-heading {
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--border);
}

.section-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 680;
}

.section-heading p {
  margin: 4px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 20px 22px 22px;
}

.theme-grid button {
  position: relative;
  display: grid;
  min-height: 88px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.theme-grid button:hover {
  border-color: var(--border-emphasis);
  background: var(--surface-subtle);
}

.theme-grid button.selected {
  border-color: var(--primary-600);
  background: var(--primary-surface);
  box-shadow: 0 0 0 2px rgb(22 163 74 / 9%);
}

.theme-icon {
  display: grid;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  place-items: center;
}

.theme-grid strong,
.theme-grid small {
  display: block;
}

.theme-grid strong {
  font-size: 13px;
  font-weight: 650;
}

.theme-grid small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1.4;
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--primary-600);
}

.setting-list {
  padding: 0 22px;
}

.setting-row {
  display: flex;
  min-height: 75px;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  border-bottom: 1px solid var(--border);
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row.disabled {
  opacity: 0.55;
}

.setting-row strong {
  display: block;
  color: var(--text);
  font-size: 13px;
  font-weight: 630;
}

.setting-row p {
  margin: 4px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.5;
}

.setting-row select {
  width: 158px;
  height: 36px;
  flex: 0 0 auto;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  outline: none;
}

.setting-row select:focus {
  border-color: var(--primary-600);
  box-shadow: 0 0 0 3px rgb(22 163 74 / 11%);
}

.switch {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: var(--control-disabled);
  cursor: pointer;
  transition: background 150ms ease;
}

.switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(22 34 26 / 20%);
  transition: transform 150ms ease;
}

.switch.enabled {
  background: var(--primary-600);
}

.switch.enabled span {
  transform: translateX(16px);
}

.storage-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 22px 0;
  padding: 15px;
  border: 1px solid var(--primary-border);
  border-radius: 7px;
  background: var(--primary-surface);
}

.storage-summary > span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 6px;
  background: var(--primary-surface-strong);
  color: var(--primary-text);
  place-items: center;
}

.storage-summary strong {
  display: block;
  font-size: 13px;
  font-weight: 650;
}

.storage-summary p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.45;
}

.data-actions {
  padding: 10px 22px 16px;
}

.data-actions > div {
  display: grid;
  min-height: 72px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border);
}

.data-actions > div:last-child {
  border-bottom: 0;
}

.data-actions__icon {
  display: grid;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  place-items: center;
}

.data-actions strong {
  display: block;
  font-size: 13px;
  font-weight: 630;
}

.data-actions p {
  margin: 3px 0 0;
  color: var(--text-tertiary);
  font-size: 11px;
}

.secondary-button,
.danger-button {
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.secondary-button:hover:not(:disabled) {
  border-color: var(--border-emphasis);
  background: var(--surface-subtle);
}

.secondary-button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.data-actions__danger .data-actions__icon {
  border-color: var(--danger-border);
  background: var(--danger-surface);
  color: var(--danger-text);
}

.data-actions__danger strong {
  color: var(--danger-text);
}

.danger-button {
  border-color: var(--danger-border);
  color: var(--danger-text);
}

.danger-button:hover {
  border-color: var(--danger-border);
  background: var(--danger-surface);
}

.privacy-panel {
  padding-bottom: 20px;
}

.privacy-panel > :deep(.privacy-notice) {
  margin: 20px 22px 14px;
}

.privacy-panel ul {
  display: grid;
  gap: 7px;
  margin: 0 22px;
  padding: 0 0 0 20px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.support-panel__payments {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 22px;
}

.support-panel figure {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin: 0;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.support-panel img {
  display: block;
  width: min(100%, 184px);
  aspect-ratio: 1;
  object-fit: contain;
  background: var(--surface);
}

.support-panel figcaption {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.back-link:focus-visible,
.settings-nav a:focus-visible,
.settings-nav button:focus-visible,
.theme-grid button:focus-visible,
.switch:focus-visible,
.secondary-button:focus-visible,
.danger-button:focus-visible {
  outline: 3px solid rgb(22 163 74 / 18%);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(1px, 1px, 1px, 1px) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
}

@media (max-width: 780px) {
  main {
    width: min(100% - 32px, 680px);
    grid-template-columns: 1fr;
    gap: 20px;
    padding-top: 28px;
  }

  .settings-nav {
    position: static;
    display: block;
    height: auto;
    overflow-x: auto;
  }

  .settings-nav > div {
    display: flex;
    min-width: max-content;
    gap: 3px;
  }

  .settings-nav__label,
  .settings-nav > button {
    display: none;
  }

  .settings-nav a {
    height: 36px;
    padding: 0 9px;
  }
}

@media (max-width: 580px) {
  .settings-header {
    padding: 0 16px;
  }

  .back-link {
    width: 38px;
    padding: 0;
    justify-content: center;
    font-size: 0;
  }

  .theme-grid {
    grid-template-columns: 1fr;
  }

  .support-panel__payments {
    grid-template-columns: 1fr;
  }

  .setting-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 17px 0;
  }

  .setting-row select {
    width: 100%;
  }

  .data-actions > div {
    grid-template-columns: auto minmax(0, 1fr);
    padding: 14px 0;
  }

  .data-actions button {
    grid-column: 2;
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .switch,
  .switch span {
    transition: none;
  }
}
</style>
