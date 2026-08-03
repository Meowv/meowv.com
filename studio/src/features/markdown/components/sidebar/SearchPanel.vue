<script setup lang="ts">
import { FileSearch, LoaderCircle, Search } from '@/features/markdown/icons';
import { onBeforeUnmount } from 'vue';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';

const store = useWorkspaceStore();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function submit(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  void store.performSearch();
}

function scheduleSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = globalThis.setTimeout(() => {
    searchTimer = undefined;
    void store.performSearch();
  }, 160);
}

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <section class="panel" aria-labelledby="search-panel-title">
    <header class="panel__header">
      <h2 id="search-panel-title" class="panel__title">全文搜索</h2>
      <LoaderCircle
        v-if="store.indexing"
        :size="16"
        class="animate-spin text-[var(--color-text-muted)]"
        aria-label="正在建立索引"
      />
    </header>

    <form class="search-panel__form" role="search" @submit.prevent="submit">
      <label class="field">
        <Search :size="16" aria-hidden="true" />
        <input
          v-model="store.searchQuery"
          type="search"
          placeholder="搜索所有 Markdown 内容"
          aria-label="搜索所有 Markdown 内容"
          autofocus
          @input="scheduleSearch"
        />
      </label>
    </form>

    <div class="panel__body">
      <div v-if="store.searchResults.length" class="search-results">
        <button
          v-for="result in store.searchResults"
          :key="result.id"
          class="search-result"
          type="button"
          @click="store.openDocument(result.path)"
        >
          <span class="search-result__title">{{ result.title }}</span>
          <span class="search-result__path">
            {{ result.path }} · 第 {{ result.lineNumber }} 行
          </span>
          <span class="search-result__snippet">{{ result.snippet }}</span>
        </button>
      </div>
      <div v-else class="panel__empty">
        <div>
          <FileSearch :size="28" class="mx-auto mb-3" aria-hidden="true" />
          <p class="m-0">
            {{ store.searchQuery ? '没有匹配结果' : '输入关键词搜索文件名、正文、路径和标签' }}
          </p>
          <p class="mt-2 text-xs">快捷键：Ctrl / ⌘ + Shift + F</p>
        </div>
      </div>
    </div>
  </section>
</template>
