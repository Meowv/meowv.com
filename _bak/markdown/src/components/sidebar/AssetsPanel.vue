<script setup lang="ts">
import { Copy, Image, Search } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
const keyword = ref("");
const visibleLimit = ref(120);

const filteredAssets = computed(() => {
  const normalized = keyword.value.trim().toLocaleLowerCase();
  if (!normalized) {
    return store.assets;
  }
  return store.assets.filter(
    (asset) =>
      asset.name.toLocaleLowerCase().includes(normalized) ||
      asset.path.toLocaleLowerCase().includes(normalized),
  );
});

const visibleAssets = computed(() =>
  filteredAssets.value.slice(0, visibleLimit.value),
);

watch(keyword, () => {
  visibleLimit.value = 120;
});

async function showMoreAssets(): Promise<void> {
  visibleLimit.value += 120;
  await store.loadAssetPreviews(visibleLimit.value);
}
</script>

<template>
  <section class="panel" aria-labelledby="assets-panel-title">
    <header class="panel__header">
      <h2 id="assets-panel-title" class="panel__title">图片资源</h2>
      <span class="text-xs text-[var(--color-text-muted)]">
        {{ store.assets.length }} 张
      </span>
    </header>

    <div class="asset-search">
      <label class="field">
        <Search :size="16" aria-hidden="true" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索图片"
          aria-label="搜索图片"
        />
      </label>
    </div>

    <div class="panel__body">
      <div v-if="filteredAssets.length" class="assets-grid">
        <button
          v-for="asset in visibleAssets"
          :key="asset.path"
          class="asset-card"
          type="button"
          :title="`复制 ${asset.name} 的 Markdown 引用`"
          @click="store.copyAssetReference(asset)"
        >
          <span class="asset-card__preview">
            <img
              v-if="asset.url"
              :src="asset.url"
              :alt="asset.name"
              loading="lazy"
              decoding="async"
            />
            <Image v-else :size="28" aria-hidden="true" />
          </span>
          <span class="asset-card__name">
            <Copy :size="12" class="mr-1 inline" aria-hidden="true" />
            {{ asset.name }}
          </span>
        </button>
      </div>
      <div
        v-if="visibleAssets.length < filteredAssets.length"
        class="px-3 pb-4 text-center"
      >
        <button
          class="secondary-button button--small"
          type="button"
          @click="showMoreAssets"
        >
          加载更多（{{ filteredAssets.length - visibleAssets.length }}）
        </button>
      </div>
      <div v-if="!filteredAssets.length" class="panel__empty">
        <div>
          <Image :size="28" class="mx-auto mb-3" aria-hidden="true" />
          <p class="m-0">工作空间内没有可预览的图片</p>
          <p class="mt-2 text-xs">拖入或粘贴图片时会自动保存到 assets</p>
        </div>
      </div>
    </div>
  </section>
</template>
