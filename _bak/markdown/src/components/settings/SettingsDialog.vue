<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";
import type {
  AutoSaveDelay,
  ThemePreference,
  WorkspacePreferences,
} from "@/types/workspace";

type BooleanPreferenceKey =
  | "autoSaveEnabled"
  | "wordWrap"
  | "lineNumbers"
  | "previewEnabled"
  | "syncScroll";

const store = useWorkspaceStore();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

const themeOptions: ReadonlyArray<{
  value: ThemePreference;
  label: string;
}> = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const autosaveOptions: ReadonlyArray<{
  value: AutoSaveDelay;
  label: string;
}> = [
  { value: 1000, label: "1 秒" },
  { value: 2000, label: "2 秒" },
  { value: 5000, label: "5 秒" },
];

const fontSizeOptions = [12, 13, 14, 15, 16, 18, 20, 24] as const;

function close(): void {
  store.settingsOpen = false;
}

function setTheme(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "system" || value === "light" || value === "dark") {
    void store.updatePreferences({ theme: value });
  }
}

function setAutosaveDelay(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (value === 1000 || value === 2000 || value === 5000) {
    void store.updatePreferences({ autoSaveDelay: value });
  }
}

function setEditorFontSize(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(value)) {
    void store.updatePreferences({ editorFontSize: value });
  }
}

function setBooleanPreference(key: BooleanPreferenceKey, value: boolean): void {
  void store.updatePreferences({
    [key]: value,
  } as Partial<WorkspacePreferences>);
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (store.settingsOpen && event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab" || !dialog.value) {
    return;
  }

  const focusableElements = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden);
  const first = focusableElements[0];
  const last = focusableElements.at(-1);

  if (!first || !last) {
    event.preventDefault();
    dialog.value.focus();
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => store.settingsOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      await nextTick();
      closeButton.value?.focus();
      return;
    }

    previouslyFocusedElement?.focus();
    previouslyFocusedElement = null;
  },
);

onMounted(() => {
  document.addEventListener("keydown", handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="store.settingsOpen" class="modal-backdrop" @click.self="close">
      <section
        ref="dialog"
        class="modal modal--wide"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
        @keydown="trapFocus"
      >
        <header class="modal__header">
          <div>
            <h2 id="settings-dialog-title">设置</h2>
            <p id="settings-dialog-description" class="sr-only">
              调整 Markdown Studio 的外观、保存、编辑器和预览偏好。
            </p>
          </div>
          <button
            ref="closeButton"
            class="icon-button"
            type="button"
            aria-label="关闭设置"
            @click="close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div class="modal__body">
          <section class="settings-section" aria-labelledby="appearance-title">
            <h3 id="appearance-title">外观与布局</h3>
            <p>选择主题，并调整编辑区域的显示密度。</p>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>主题</strong>
                <span>可固定浅色、深色，或跟随系统设置。</span>
              </div>
              <select
                class="select"
                aria-label="主题"
                :value="store.preferences.theme"
                @change="setTheme"
              >
                <option
                  v-for="option in themeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>编辑器字号</strong>
                <span>仅影响 Markdown 源码编辑区域。</span>
              </div>
              <select
                class="select"
                aria-label="编辑器字号"
                :value="store.preferences.editorFontSize"
                @change="setEditorFontSize"
              >
                <option
                  v-for="size in fontSizeOptions"
                  :key="size"
                  :value="size"
                >
                  {{ size }} px
                </option>
              </select>
            </div>
          </section>

          <section class="settings-section" aria-labelledby="saving-title">
            <h3 id="saving-title">保存</h3>
            <p>更改直接写入当前已授权的本地工作空间。</p>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>自动保存</strong>
                <span>停止输入一段时间后自动保存当前文档。</span>
              </div>
              <button
                class="toggle"
                :class="{
                  'toggle--on': store.preferences.autoSaveEnabled,
                }"
                type="button"
                role="switch"
                :aria-checked="store.preferences.autoSaveEnabled"
                aria-label="自动保存"
                @click="
                  setBooleanPreference(
                    'autoSaveEnabled',
                    !store.preferences.autoSaveEnabled,
                  )
                "
              />
            </div>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>自动保存延迟</strong>
                <span>从最后一次编辑开始计算。</span>
              </div>
              <select
                class="select"
                aria-label="自动保存延迟"
                :value="store.preferences.autoSaveDelay"
                :disabled="!store.preferences.autoSaveEnabled"
                @change="setAutosaveDelay"
              >
                <option
                  v-for="option in autosaveOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </section>

          <section class="settings-section" aria-labelledby="editor-title">
            <h3 id="editor-title">编辑器</h3>
            <p>控制编辑器的文本展示行为。</p>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>自动换行</strong>
                <span>长行会在编辑区宽度内折行显示。</span>
              </div>
              <button
                class="toggle"
                :class="{ 'toggle--on': store.preferences.wordWrap }"
                type="button"
                role="switch"
                :aria-checked="store.preferences.wordWrap"
                aria-label="自动换行"
                @click="
                  setBooleanPreference('wordWrap', !store.preferences.wordWrap)
                "
              />
            </div>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>显示行号</strong>
                <span>在编辑器左侧显示源码行号。</span>
              </div>
              <button
                class="toggle"
                :class="{ 'toggle--on': store.preferences.lineNumbers }"
                type="button"
                role="switch"
                :aria-checked="store.preferences.lineNumbers"
                aria-label="显示行号"
                @click="
                  setBooleanPreference(
                    'lineNumbers',
                    !store.preferences.lineNumbers,
                  )
                "
              />
            </div>
          </section>

          <section class="settings-section" aria-labelledby="preview-title">
            <h3 id="preview-title">预览</h3>
            <p>控制实时预览区域及编辑与预览之间的联动。</p>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>显示实时预览</strong>
                <span>关闭后为编辑器释放更多横向空间。</span>
              </div>
              <button
                class="toggle"
                :class="{ 'toggle--on': store.preferences.previewEnabled }"
                type="button"
                role="switch"
                :aria-checked="store.preferences.previewEnabled"
                aria-label="显示实时预览"
                @click="
                  setBooleanPreference(
                    'previewEnabled',
                    !store.preferences.previewEnabled,
                  )
                "
              />
            </div>

            <div class="settings-row">
              <div class="settings-row__copy">
                <strong>同步滚动</strong>
                <span>让编辑器和预览尽量保持在相近阅读位置。</span>
              </div>
              <button
                class="toggle"
                :class="{ 'toggle--on': store.preferences.syncScroll }"
                type="button"
                role="switch"
                :aria-checked="store.preferences.syncScroll"
                :disabled="!store.preferences.previewEnabled"
                aria-label="同步滚动"
                @click="
                  setBooleanPreference(
                    'syncScroll',
                    !store.preferences.syncScroll,
                  )
                "
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>
