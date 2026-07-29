<script setup lang="ts">
import {
  Check,
  ChevronDown,
  CircleAlert,
  CloudOff,
  Download,
  FileClock,
  FileDown,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  History,
  Home,
  Info,
  LoaderCircle,
  Pencil,
  Printer,
  Redo2,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Undo2,
} from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { SaveStatus } from "@/stores/editor.store";

import type { EditorAction } from "./editor.types";

const props = defineProps<{
  name: string;
  saveStatus: SaveStatus;
  saveStatusText: string;
  online: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  action: [action: EditorAction];
  rename: [name: string];
}>();

const draftName = ref(props.name);
const openMenu = ref<"file" | "edit" | null>(null);
const headerRef = ref<HTMLElement | null>(null);

const statusIcon = computed(() => {
  if (props.saveStatus === "saving") return LoaderCircle;
  if (props.saveStatus === "error") return CircleAlert;
  if (props.saveStatus === "saved") return Check;
  return ShieldCheck;
});

watch(
  () => props.name,
  (name) => {
    draftName.value = name;
  },
);

function commitName() {
  const nextName = draftName.value.trim();
  if (!nextName) {
    draftName.value = props.name;
    return;
  }
  if (nextName !== props.name) emit("rename", nextName);
}

function trigger(action: EditorAction) {
  openMenu.value = null;
  emit("action", action);
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!headerRef.value?.contains(event.target as Node)) openMenu.value = null;
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === "Escape") openMenu.value = null;
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleEscape);
});
</script>

<template>
  <header ref="headerRef" class="editor-header">
    <div class="editor-header__main">
      <button
        class="editor-header__logo"
        type="button"
        title="返回工作簿首页"
        aria-label="返回工作簿首页"
        @click="trigger('home')"
      >
        <img src="/assets/app-icon.png" alt="" width="38" height="38" />
      </button>

      <strong class="editor-header__brand">在线 Excel 处理</strong>
      <span class="editor-header__divider" aria-hidden="true" />

      <div class="editor-header__identity">
        <input
          v-model="draftName"
          class="editor-header__name"
          type="text"
          maxlength="120"
          aria-label="工作簿名称"
          @blur="commitName"
          @keydown.enter.prevent="($event.currentTarget as HTMLInputElement).blur()"
          @keydown.esc.prevent="draftName = name"
        />
        <Pencil class="editor-header__edit-icon" :size="15" aria-hidden="true" />
        <div class="editor-header__state" :class="`is-${saveStatus}`" aria-live="polite">
          <component
            :is="statusIcon"
            :size="13"
            :class="{ 'is-spinning': saveStatus === 'saving' }"
            aria-hidden="true"
          />
          <span>{{ saveStatusText }}</span>
          <span class="editor-header__privacy">· 数据仅保存在当前浏览器</span>
        </div>
      </div>

      <div class="editor-header__actions">
        <span v-if="!online" class="editor-header__offline">
          <CloudOff :size="15" />
          离线
        </span>
        <button class="header-action" type="button" @click="trigger('help')">
          <HelpCircle :size="17" />
          <span>帮助</span>
        </button>
        <button class="header-action" type="button" @click="trigger('settings')">
          <Settings :size="17" />
          <span>设置</span>
        </button>
        <button
          class="header-action header-action--primary"
          type="button"
          :disabled="busy"
          @click="trigger('export-xlsx')"
        >
          <Download :size="17" />
          <span>导出</span>
        </button>
      </div>
    </div>

    <nav class="editor-menu" aria-label="编辑器菜单">
      <div class="editor-menu__item">
        <button
          class="editor-menu__trigger"
          :class="{ 'is-open': openMenu === 'file' }"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'file'"
          @click="openMenu = openMenu === 'file' ? null : 'file'"
        >
          文件
          <ChevronDown :size="13" />
        </button>
        <div v-if="openMenu === 'file'" class="editor-dropdown" role="menu">
          <button role="menuitem" type="button" @click="trigger('new')">
            <FilePlus2 :size="16" />新建工作簿
          </button>
          <button role="menuitem" type="button" @click="trigger('open')">
            <FolderOpen :size="16" />打开本地文件
          </button>
          <span class="editor-dropdown__separator" />
          <button role="menuitem" type="button" @click="trigger('save')">
            <Save :size="16" />保存到浏览器
            <kbd>⌘S</kbd>
          </button>
          <button role="menuitem" type="button" @click="trigger('revision')">
            <FileClock :size="16" />创建本地版本
          </button>
          <button role="menuitem" type="button" @click="trigger('history')">
            <History :size="16" />历史版本
          </button>
          <span class="editor-dropdown__separator" />
          <button role="menuitem" type="button" @click="trigger('export-xlsx')">
            <FileDown :size="16" />导出为 XLSX
          </button>
          <button role="menuitem" type="button" @click="trigger('export-csv')">
            <FileDown :size="16" />导出当前 Sheet 为 CSV
          </button>
          <button role="menuitem" type="button" @click="trigger('export-json')">
            <FileDown :size="16" />导出为 JSON
          </button>
          <button role="menuitem" type="button" @click="trigger('export-backup')">
            <FileDown :size="16" />导出完整备份
          </button>
          <button role="menuitem" type="button" @click="trigger('print')">
            <Printer :size="16" />打印
          </button>
          <span class="editor-dropdown__separator" />
          <button role="menuitem" type="button" @click="trigger('info')">
            <Info :size="16" />工作簿信息
          </button>
          <button role="menuitem" type="button" @click="trigger('home')">
            <Home :size="16" />返回首页
          </button>
          <button
            class="editor-dropdown__danger"
            role="menuitem"
            type="button"
            @click="trigger('trash')"
          >
            <Trash2 :size="16" />删除工作簿
          </button>
        </div>
      </div>

      <div class="editor-menu__item">
        <button
          class="editor-menu__trigger"
          :class="{ 'is-open': openMenu === 'edit' }"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="openMenu === 'edit'"
          @click="openMenu = openMenu === 'edit' ? null : 'edit'"
        >
          编辑
          <ChevronDown :size="13" />
        </button>
        <div
          v-if="openMenu === 'edit'"
          class="editor-dropdown editor-dropdown--compact"
          role="menu"
        >
          <button role="menuitem" type="button" @click="trigger('undo')">
            <Undo2 :size="16" />撤销
            <kbd>⌘Z</kbd>
          </button>
          <button role="menuitem" type="button" @click="trigger('redo')">
            <Redo2 :size="16" />重做
            <kbd>⇧⌘Z</kbd>
          </button>
          <button role="menuitem" type="button" @click="trigger('find')">
            <Search :size="16" />查找与替换
            <kbd>⌘F</kbd>
          </button>
        </div>
      </div>

      <button class="editor-menu__trigger" type="button" @click="trigger('ribbon-insert')">
        插入
      </button>
      <button class="editor-menu__trigger" type="button" @click="trigger('ribbon-format')">
        格式
      </button>
      <button class="editor-menu__trigger" type="button" @click="trigger('ribbon-data')">
        数据
      </button>
      <button class="editor-menu__trigger" type="button" @click="trigger('ribbon-view')">
        视图
      </button>

      <span class="editor-menu__hint">
        <ShieldCheck :size="14" />
        本地模式
      </span>
    </nav>

    <p class="editor-header__mobile-hint">建议在电脑端使用完整编辑功能</p>
  </header>
</template>

<style scoped>
.editor-header {
  position: relative;
  z-index: 50;
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.editor-header__main {
  display: flex;
  height: 68px;
  align-items: center;
  gap: 13px;
  padding: 9px 28px;
}

.editor-header__logo {
  display: grid;
  width: 42px;
  height: 42px;
  padding: 2px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  place-items: center;
}

.editor-header__logo:hover {
  background: var(--primary-surface);
}

.editor-header__logo img {
  width: 38px;
  height: 38px;
  border-radius: 7px;
}

.editor-header__brand {
  flex: none;
  color: var(--text);
  font-size: 16px;
  font-weight: 680;
  white-space: nowrap;
}

.editor-header__divider {
  width: 1px;
  height: 28px;
  flex: none;
  background: var(--border);
}

.editor-header__identity {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.editor-header__name {
  width: min(230px, 32vw);
  height: 32px;
  margin: 0;
  padding: 2px 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-strong);
  font-size: 16px;
  font-weight: 650;
  line-height: 24px;
  text-overflow: ellipsis;
}

.editor-header__edit-icon {
  flex: none;
  color: var(--text-secondary);
}

.editor-header__name:hover {
  border-color: var(--border-strong);
}

.editor-header__name:focus {
  border-color: var(--primary-600);
  background: var(--surface);
  box-shadow: 0 0 0 3px rgb(22 163 74 / 10%);
  outline: none;
}

.editor-header__state {
  display: flex;
  min-height: 18px;
  flex: none;
  align-items: center;
  gap: 5px;
  padding-left: 14px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 16px;
}

.editor-header__state.is-error {
  color: var(--danger-text);
}

.editor-header__state.is-saved {
  color: var(--primary-text-soft);
}

.editor-header__privacy {
  color: var(--text-disabled);
}

.is-spinning {
  animation: spin 800ms linear infinite;
}

.editor-header__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
}

.header-action {
  display: inline-flex;
  min-width: 36px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  padding: 7px 10px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.header-action:hover {
  background: var(--surface-muted);
  color: var(--text);
}

.header-action--primary {
  min-width: 82px;
  border-color: transparent;
  background: transparent;
  color: var(--text);
  font-weight: 600;
}

.header-action--primary:hover {
  background: var(--primary-surface);
  color: var(--primary-text);
}

.header-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.editor-header__offline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
  color: var(--warning-text);
  font-size: 12px;
}

.editor-menu {
  display: flex;
  height: 38px;
  align-items: center;
  gap: 2px;
  padding: 0 18px 0 70px;
  border-top: 1px solid var(--surface-hover);
  background: var(--surface-subtle);
}

.editor-menu__item {
  position: relative;
}

.editor-menu__trigger {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 3px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  padding: 0 10px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.editor-menu__trigger:hover,
.editor-menu__trigger.is-open {
  background: var(--primary-surface);
  color: var(--primary-text);
}

.editor-menu__hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 11px;
}

.editor-dropdown {
  position: absolute;
  z-index: 200;
  top: calc(100% + 4px);
  left: 0;
  display: grid;
  width: 270px;
  padding: 6px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 14px 36px rgb(25 40 31 / 14%);
}

.editor-dropdown--compact {
  width: 220px;
}

.editor-dropdown button {
  display: grid;
  min-height: 34px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  padding: 6px 9px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.editor-dropdown button:hover {
  background: var(--primary-surface);
  color: var(--primary-text);
}

.editor-dropdown kbd {
  color: var(--text-disabled);
  font: inherit;
  font-size: 11px;
}

.editor-dropdown__separator {
  height: 1px;
  margin: 5px 6px;
  background: var(--border);
}

.editor-dropdown button.editor-dropdown__danger {
  color: var(--danger-text);
}

.editor-dropdown button.editor-dropdown__danger:hover {
  background: var(--danger-surface);
  color: var(--danger-text);
}

.editor-header__mobile-hint {
  display: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .editor-header__main {
    height: 58px;
    padding-inline: 10px;
  }

  .editor-header__logo {
    width: 36px;
    height: 36px;
  }

  .editor-header__logo img {
    width: 32px;
    height: 32px;
  }

  .editor-header__brand,
  .editor-header__divider,
  .editor-header__edit-icon,
  .editor-header__privacy,
  .header-action span,
  .editor-menu__hint {
    display: none;
  }

  .editor-header__name {
    width: min(250px, 42vw);
  }

  .editor-header__state {
    padding-left: 0;
  }

  .editor-menu {
    overflow-x: auto;
    padding-left: 10px;
  }

  .editor-header__mobile-hint {
    display: block;
    margin: 0;
    padding: 4px 10px;
    background: var(--warning-surface);
    color: var(--warning-text);
    font-size: 11px;
    text-align: center;
  }
}
</style>
