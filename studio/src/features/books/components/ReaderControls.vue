<script setup lang="ts">
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBook,
  IconBookOff,
  IconBooks,
  IconListTree,
  IconFolderOpen,
  IconTypography,
} from '@tabler/icons-vue';
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  bookClosed: boolean;
  bookOpen: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  currentPage: number;
  pageCount: number;
  fullscreen: boolean;
  title: string;
  canConfigure: boolean;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
  jump: [page: number];
  replace: [];
  open: [];
  close: [];
  toggleFullscreen: [];
  shelf: [];
  toc: [];
  settings: [];
}>();

const previewPage = ref<number | null>(null);
const editingPage = ref(false);
const pageInput = ref<HTMLInputElement | null>(null);
const draftPage = ref(1);
const displayedPage = computed(() => previewPage.value ?? props.currentPage);
const progressPercent = computed(() =>
  props.pageCount > 1 ? ((displayedPage.value - 1) / (props.pageCount - 1)) * 100 : 0,
);

watch(
  () => props.currentPage,
  () => (previewPage.value = null),
);

function previewProgress(event: Event): void {
  previewPage.value = Number((event.target as HTMLInputElement).value);
}

function commitProgress(event: Event): void {
  const page = Number((event.target as HTMLInputElement).value);
  if (page !== props.currentPage) emit('jump', page);
  else previewPage.value = null;
}

async function beginPageEdit(): Promise<void> {
  draftPage.value = displayedPage.value;
  editingPage.value = true;
  await nextTick();
  pageInput.value?.focus();
  pageInput.value?.select();
}

function cancelPageEdit(): void {
  editingPage.value = false;
}

function commitPageEdit(): void {
  if (!editingPage.value) return;
  editingPage.value = false;
  if (!Number.isFinite(draftPage.value)) return;
  const page = Math.min(props.pageCount, Math.max(1, Math.trunc(draftPage.value)));
  if (page !== props.currentPage) {
    previewPage.value = page;
    emit('jump', page);
  } else previewPage.value = null;
}

const actionTitle = (action: string, shortcut: string): string => `${action}（${shortcut}）`;
const previousAction = (): string => (props.currentPage <= 1 ? '合上书' : '上一页');
const nextAction = (): string =>
  props.currentPage >= Math.max(1, props.pageCount) ? '合上书' : '下一页';
</script>

<template>
  <div class="books-reader-controls">
    <div class="books-reader-controls__top">
      <div class="books-reader-controls__identity" :title="title">
        <IconBook :size="19" stroke-width="1.7" />
        <span>{{ title }}</span>
      </div>
      <div class="books-reader-controls__actions">
        <button type="button" title="返回书架" aria-label="返回书架" @click="$emit('shelf')">
          <IconBooks :size="19" aria-hidden="true" />
        </button>
        <button type="button" title="目录" aria-label="打开目录" @click="$emit('toc')">
          <IconListTree :size="19" aria-hidden="true" />
        </button>
        <button
          v-if="canConfigure"
          type="button"
          title="排版"
          aria-label="打开排版设置"
          @click="$emit('settings')"
        >
          <IconTypography :size="19" aria-hidden="true" />
        </button>
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
          title="打开书"
          aria-label="打开书"
          @click="$emit('open')"
        >
          <IconBook :size="19" aria-hidden="true" />
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
        <input
          class="books-progress__track"
          type="range"
          min="1"
          :max="pageCount"
          step="1"
          :value="displayedPage"
          :style="{ '--books-progress': `${progressPercent}%` }"
          :aria-label="`跳转页码，当前第 ${displayedPage} 页，共 ${pageCount} 页`"
          @input="previewProgress"
          @change="commitProgress"
        />
        <input
          v-if="editingPage"
          ref="pageInput"
          v-model.number="draftPage"
          class="books-progress__page-input"
          type="number"
          :min="1"
          :max="pageCount"
          aria-label="输入要跳转的页码"
          @keydown.enter.prevent="commitPageEdit"
          @keydown.esc.prevent="cancelPageEdit"
          @blur="commitPageEdit"
        />
        <button
          v-else
          type="button"
          class="books-progress__label"
          :aria-label="`第 ${displayedPage} 页，共 ${pageCount} 页，点击输入页码`"
          title="输入页码跳转"
          @click="beginPageEdit"
        >
          {{ displayedPage }} / {{ pageCount }}
        </button>
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
