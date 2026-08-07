<script setup lang="ts">
import { Tags } from '@/features/markdown/icons';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';

const store = useWorkspaceStore();
</script>

<template>
  <section class="panel" aria-labelledby="tags-panel-title">
    <header class="panel__header">
      <h2 id="tags-panel-title" class="panel__title">标签</h2>
      <span class="text-xs text-[var(--color-text-muted)]"> {{ store.tagCounts.length }} 个 </span>
    </header>

    <div class="panel__body">
      <div v-if="store.tagCounts.length" class="tag-list">
        <div v-for="item in store.tagCounts" :key="item.tag" class="tag-group">
          <button
            class="tag-row"
            :class="{
              'bg-[var(--color-brand-soft)]': store.selectedTag === item.tag,
            }"
            type="button"
            @click="store.selectTag(item.tag)"
          >
            <span class="tag-row__name"># {{ item.tag }}</span>
            <span class="tag-row__count">{{ item.count }}</span>
          </button>

          <div
            v-if="store.selectedTag === item.tag && store.selectedTagDocuments.length"
            class="tag-group__documents"
          >
            <button
              v-for="document in store.selectedTagDocuments"
              :key="document.path"
              class="backlink-row"
              type="button"
              @click="store.openDocument(document.path)"
            >
              <span class="backlink-row__title">{{ document.parsed.metadata.title }}</span>
              <span class="backlink-row__path">{{ document.path }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!store.tagCounts.length" class="panel__empty">
        <div>
          <Tags :size="28" class="mx-auto mb-3" aria-hidden="true" />
          <p class="m-0">Front Matter 中的标签会显示在这里</p>
        </div>
      </div>
    </div>
  </section>
</template>
