<script setup lang="ts">
import { IconPlus, IconTrash } from '@tabler/icons-vue';
import type { BookshelfEntry } from '../persistence/BookshelfRepository';
import BookshelfCover from './BookshelfCover.vue';

defineProps<{
  entries: BookshelfEntry[];
  persistent: boolean;
  error?: string;
}>();

defineEmits<{
  pick: [];
  open: [entry: BookshelfEntry];
  remove: [entry: BookshelfEntry, removeProgress: boolean];
}>();

function author(entry: BookshelfEntry): string {
  return entry.metadata.authors.join('、') || '未知作者';
}

function progress(entry: BookshelfEntry): number {
  return Math.round((entry.progress?.fallbackProgress ?? 0) * 100);
}
</script>

<template>
  <section class="books-shelf" aria-label="我的书架">
    <p v-if="!persistent" class="books-shelf__notice" role="status">
      当前浏览器无法持久化文件句柄；刷新后需要重新选择书籍。
    </p>
    <p v-if="error" class="books-shelf__error" role="alert">{{ error }}</p>

    <div class="books-shelf__grid">
      <article v-for="entry in entries" :key="entry.id" class="books-shelf-card">
        <button
          type="button"
          class="books-shelf-card__remove"
          aria-label="移出书架"
          title="移出书架"
          @click="$emit('remove', entry, false)"
        >
          <IconTrash :size="15" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="books-shelf-card__cover"
          draggable="false"
          @click="$emit('open', entry)"
          @dragstart.prevent
        >
          <BookshelfCover :blob="entry.coverThumbnail" :alt="`${entry.metadata.title} 封面`" />
          <i>{{ entry.format.toUpperCase() }}</i>
          <em v-if="entry.availability !== 'available'">需要重新添加</em>
          <span
            class="books-shelf-card__cover-progress"
            :aria-label="`阅读进度 ${progress(entry)}%`"
          >
            <span><i :style="{ width: `${progress(entry)}%` }"></i></span>
            <b>{{ progress(entry) }}%</b>
          </span>
        </button>
        <div class="books-shelf-card__body">
          <h2 :title="entry.metadata.title">{{ entry.metadata.title }}</h2>
          <p :title="author(entry)">{{ author(entry) }}</p>
        </div>
      </article>

      <article class="books-shelf-card books-shelf-card--add">
        <button type="button" class="books-shelf-card__add" @click="$emit('pick')">
          <IconPlus :size="38" stroke-width="1.25" aria-hidden="true" />
          <span>添加本地书籍</span>
        </button>
      </article>
    </div>
  </section>
</template>
