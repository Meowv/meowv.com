<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconApps, IconRefresh, IconSearch, IconWindmill, IconX } from '@tabler/icons-vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import { useToolsPreferences } from '@/features/tools/composables/useToolsPreferences';

const {
  settingsOpen,
  enabled,
  videoUrl,
  opacity,
  blur,
  surfaceOpacity,
  randomShortcutEnabled,
  applyToOtherPages,
  hasAvailableVideos,
  isLoading,
  errorMessage,
  closeSettings,
  requestRandomVideo,
  setOpacity,
  setBlur,
  setSurfaceOpacity,
  setRandomShortcutEnabled,
  setApplyToOtherPages,
  cancelBackground,
} = useToolsBackground();
const { searchVisible, setSearchVisible } = useToolsPreferences();

const closeButton = ref<HTMLButtonElement | null>(null);
const videoName = computed(() => {
  const encodedName = videoUrl.value?.split('/').pop()?.split('?')[0];
  if (!encodedName) return '';
  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
});
let lastActiveElement: HTMLElement | null = null;

function close(): void {
  closeSettings();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

watch(
  settingsOpen,
  async (isOpen) => {
    if (!isOpen) {
      document.removeEventListener('keydown', handleKeydown);
      document.body.classList.remove('has-dialog-open');
      lastActiveElement?.focus();
      lastActiveElement = null;
      return;
    }

    lastActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('has-dialog-open');
    document.addEventListener('keydown', handleKeydown);
    await nextTick();
    closeButton.value?.focus();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.classList.remove('has-dialog-open');
});
</script>

<template>
  <Teleport to="body">
    <Transition name="tools-background-dialog">
      <div v-if="settingsOpen" class="tools-background-dialog" @click.self="close">
        <section
          class="tools-background-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-label="工具设置"
        >
          <button
            ref="closeButton"
            class="tools-background-dialog__close"
            type="button"
            aria-label="关闭工具设置"
            title="关闭"
            @click="close"
          >
            <IconX :size="18" aria-hidden="true" />
          </button>

          <div class="tools-background-dialog__controls">
            <template v-if="hasAvailableVideos">
              <div class="tools-background-dialog__status-row">
                <div>
                  <span>{{ enabled ? '背景已启用' : '背景未启用' }}</span>
                  <p v-if="errorMessage" class="tools-background-dialog__error" role="status">
                    {{ errorMessage }}
                  </p>
                  <small v-if="videoName">{{ videoName }}</small>
                </div>
                <IconWindmill
                  v-if="isLoading"
                  class="tools-windmill-icon is-spinning"
                  :size="18"
                  aria-label="加载中"
                />
              </div>

              <div
                class="tools-background-dialog__actions"
                :class="{
                  'tools-background-dialog__actions--split': enabled || isLoading,
                }"
              >
                <button
                  class="tools-background-dialog__random"
                  type="button"
                  :disabled="isLoading"
                  @click="requestRandomVideo"
                >
                  <IconRefresh :size="17" aria-hidden="true" />
                  {{ enabled ? '切换背景' : '启用背景' }}
                </button>
                <button
                  v-if="enabled || isLoading"
                  class="tools-background-dialog__cancel"
                  type="button"
                  @click="cancelBackground"
                >
                  取消视频背景
                </button>
              </div>

              <label class="tools-background-dialog__range">
                <span
                  ><b>视频透明度</b><output>{{ Math.round(opacity * 100) }}%</output></span
                >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="opacity"
                  @input="setOpacity(Number(($event.target as HTMLInputElement).value))"
                />
              </label>

              <label class="tools-background-dialog__range">
                <span
                  ><b>面板背景</b><output>{{ Math.round(surfaceOpacity * 100) }}%</output></span
                >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="surfaceOpacity"
                  @input="setSurfaceOpacity(Number(($event.target as HTMLInputElement).value))"
                />
              </label>

              <label class="tools-background-dialog__range">
                <span
                  ><b>模糊</b><output>{{ blur }}px</output></span
                >
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  :value="blur"
                  @input="setBlur(Number(($event.target as HTMLInputElement).value))"
                />
              </label>

              <label class="tools-background-dialog__toggle">
                <span>
                  <IconWindmill class="tools-windmill-icon" :size="17" aria-hidden="true" />
                  <span><b>切换背景快捷操作</b><small>在工具首页显示右上角风车</small></span>
                </span>
                <input
                  type="checkbox"
                  aria-label="开启切换背景快捷操作"
                  :checked="randomShortcutEnabled"
                  @change="setRandomShortcutEnabled(($event.target as HTMLInputElement).checked)"
                />
              </label>

              <label class="tools-background-dialog__toggle">
                <span>
                  <IconApps :size="17" aria-hidden="true" />
                  <span><b>应用于其他页面</b><small>在其他页面也显示视频背景</small></span>
                </span>
                <input
                  type="checkbox"
                  aria-label="将视频背景应用于其他页面"
                  :checked="applyToOtherPages"
                  @change="setApplyToOtherPages(($event.target as HTMLInputElement).checked)"
                />
              </label>
            </template>

            <p v-else class="tools-background-dialog__empty">暂未发现 MP4 背景视频。</p>

            <label class="tools-background-dialog__toggle">
              <span>
                <IconSearch :size="17" aria-hidden="true" />
                <span><b>显示搜索框</b><small>在工具首页顶部显示搜索框</small></span>
              </span>
              <input
                type="checkbox"
                aria-label="显示工具首页搜索框"
                :checked="searchVisible"
                @change="setSearchVisible(($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
