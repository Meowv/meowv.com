<script setup lang="ts">
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBook2,
  IconBookOff,
  IconFolderOpen,
} from '@tabler/icons-vue';

const props = defineProps<{
  bookClosed: boolean;
  bookOpen: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  currentPage: number;
  pageCount: number;
  fullscreen: boolean;
}>();

defineEmits<{
  previous: [];
  next: [];
  replace: [];
  open: [];
  close: [];
  toggleFullscreen: [];
}>();

const actionTitle = (action: string, shortcut: string): string => `${action}（${shortcut}）`;
const previousAction = (): string => (props.currentPage <= 1 ? '合上书' : '上一页');
const nextAction = (): string =>
  props.currentPage >= Math.max(1, props.pageCount - 1) ? '合上书' : '下一页';
</script>

<template>
  <div class="books-reader-controls">
    <div class="books-reader-controls__top">
      <div class="books-reader-controls__identity" aria-hidden="true">
        <IconBook2 :size="19" stroke-width="1.7" />
        <span>Books</span>
      </div>
      <div class="books-reader-controls__actions">
        <button type="button" title="更换书籍" aria-label="更换书籍" @click="$emit('replace')">
          <IconFolderOpen :size="19" aria-hidden="true" />
        </button>
        <button
          type="button"
          :title="fullscreen ? '退出全屏（F）' : '进入全屏（F）'"
          :aria-label="fullscreen ? '退出全屏' : '进入全屏'"
          @click="$emit('toggleFullscreen')"
        >
          <IconArrowsMinimize v-if="fullscreen" :size="19" aria-hidden="true" />
          <IconArrowsMaximize v-else :size="19" aria-hidden="true" />
        </button>
        <button
          v-if="bookClosed"
          type="button"
          title="打开书籍"
          aria-label="打开书籍"
          @click="$emit('open')"
        >
          <IconBook2 :size="19" aria-hidden="true" />
        </button>
        <button
          v-else-if="bookOpen"
          type="button"
          title="合上书"
          aria-label="合上书"
          @click="$emit('close')"
        >
          <IconBookOff :size="19" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="bookOpen" class="books-reader-controls__bottom">
      <button
        type="button"
        :disabled="!canGoBack"
        :title="actionTitle(previousAction(), '← / PageUp')"
        :aria-label="previousAction()"
        @click="$emit('previous')"
      >
        <IconArrowLeft :size="14" aria-hidden="true" />
      </button>
      <div class="books-progress">
        <span
          class="books-progress__track"
          role="progressbar"
          :aria-valuenow="currentPage"
          aria-valuemin="1"
          :aria-valuemax="pageCount"
          :aria-label="`阅读进度，第 ${currentPage} 页，共 ${pageCount} 页`"
        >
          <i
            :style="{ width: `${Math.max(0, Math.min(100, (currentPage / pageCount) * 100))}%` }"
          ></i>
        </span>
        <span class="books-progress__label">{{ currentPage }} / {{ pageCount }}</span>
      </div>
      <button
        type="button"
        :disabled="!canGoForward"
        :title="actionTitle(nextAction(), '→ / PageDown / Space')"
        :aria-label="nextAction()"
        @click="$emit('next')"
      >
        <IconArrowRight :size="14" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
