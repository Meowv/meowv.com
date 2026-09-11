<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { IconCheck, IconRefresh } from '@tabler/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getSpecialSymbolCategoryFromHash,
  loadSpecialSymbolCategory,
  specialSymbolCategories,
  type CharacterItem,
  type SpecialSymbolCategoryId,
} from './categories';

const route = useRoute();
const router = useRouter();
const characters = ref<readonly CharacterItem[]>([]);
const copiedKey = ref('');
const feedback = ref('');
const isLoading = ref(false);
const loadFailed = ref(false);
const tooltip = ref<{ name: string; x: number; y: number } | null>(null);
let copiedTimer: number | null = null;
let feedbackTimer: number | null = null;
let loadingRequest = 0;

const activeCategoryId = computed<SpecialSymbolCategoryId>(() =>
  getSpecialSymbolCategoryFromHash(route.hash),
);

async function loadCharacters(categoryId: SpecialSymbolCategoryId): Promise<void> {
  const request = ++loadingRequest;
  isLoading.value = true;
  loadFailed.value = false;

  try {
    const nextCharacters = await loadSpecialSymbolCategory(categoryId);
    if (request !== loadingRequest) return;
    characters.value = nextCharacters;
  } catch {
    if (request !== loadingRequest) return;
    characters.value = [];
    loadFailed.value = true;
  } finally {
    if (request === loadingRequest) isLoading.value = false;
  }
}

async function copyCharacter(character: CharacterItem, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(character.value);
    copiedKey.value = key;
    feedback.value = `已复制 ${character.value}`;

    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedKey.value = '';
      copiedTimer = null;
    }, 800);
  } catch {
    feedback.value = '复制失败，请手动复制';
  }

  if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    feedback.value = '';
    feedbackTimer = null;
  }, 1500);
}

function showCharacterTooltip(event: MouseEvent, name: string): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const halfTooltipWidth = Math.min(140, (window.innerWidth - 24) / 2);
  tooltip.value = {
    name,
    x: Math.min(
      Math.max(rect.left + rect.width / 2, halfTooltipWidth),
      window.innerWidth - halfTooltipWidth,
    ),
    y: rect.top - 8,
  };
}

function hideCharacterTooltip(): void {
  tooltip.value = null;
}

watch(
  () => route.hash,
  (hash) => {
    const categoryId = getSpecialSymbolCategoryFromHash(hash);
    void loadCharacters(categoryId);
    if (hash !== `#${categoryId}`) {
      void router.replace({ path: route.path, query: route.query, hash: `#${categoryId}` });
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
  loadingRequest += 1;
});
</script>

<template>
  <section class="tool-section">
    <div class="tool-section__body">
      <nav class="symbol-picker__categories" aria-label="字符分类">
        <RouterLink
          v-for="category in specialSymbolCategories"
          :key="category.id"
          class="symbol-picker__category"
          :class="{ 'is-active': activeCategoryId === category.id }"
          :to="{
            name: 'tool-detail',
            params: { toolId: 'special-symbols' },
            hash: `#${category.id}`,
          }"
        >
          {{ category.name }}
        </RouterLink>
      </nav>

      <div v-if="isLoading" class="symbol-picker__state" role="status">正在加载字符...</div>

      <div
        v-else-if="loadFailed"
        class="symbol-picker__state symbol-picker__state--error"
        role="alert"
      >
        <span>字符数据加载失败</span>
        <button
          type="button"
          aria-label="重新加载"
          title="重新加载"
          @click="loadCharacters(activeCategoryId)"
        >
          <IconRefresh :size="17" aria-hidden="true" />
        </button>
      </div>

      <div v-else class="symbol-picker__grid" :class="{ 'is-emoji': activeCategoryId === 'Emoji' }">
        <button
          v-for="(character, index) in characters"
          :key="`${character.unicode}-${index}`"
          type="button"
          :class="{
            'is-copied': copiedKey === `${character.unicode}-${index}`,
          }"
          :aria-label="`复制 ${character.name}（${character.unicode}）`"
          @mouseenter="showCharacterTooltip($event, character.name)"
          @mouseleave="hideCharacterTooltip"
          @click="copyCharacter(character, `${character.unicode}-${index}`)"
        >
          <IconCheck
            v-if="copiedKey === `${character.unicode}-${index}`"
            :size="18"
            aria-hidden="true"
          />
          <span v-else>{{ character.value }}</span>
        </button>
      </div>

      <div class="symbol-picker__feedback" :class="{ 'is-visible': feedback }" role="status">
        {{ feedback }}
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="tooltip"
      class="symbol-picker__tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      role="tooltip"
    >
      {{ tooltip.name }}
    </div>
  </Teleport>
</template>

<style scoped>
.symbol-picker__categories {
  display: flex;
  margin-bottom: 22px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: thin;
}

.symbol-picker__category {
  display: inline-flex;
  flex: 1 0 auto;
  min-width: 0;
  min-height: 38px;
  padding: 0 14px;
  border-right: 1px solid var(--color-border);
  align-items: center;
  justify-content: center;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.symbol-picker__category:last-child {
  border-right: 0;
}

.symbol-picker__category:hover,
.symbol-picker__category:focus-visible,
.symbol-picker__category.is-active {
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.symbol-picker__state {
  display: flex;
  min-height: 180px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.symbol-picker__state--error {
  gap: 8px;
  color: var(--color-danger, #dc2626);
}

.symbol-picker__state--error button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid currentColor;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.symbol-picker__state--error button:focus-visible {
  outline: 2px solid var(--tools-accent);
  outline-offset: 2px;
}

.symbol-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 7px;
}

.symbol-picker__grid button {
  display: inline-flex;
  position: relative;
  min-width: 0;
  min-height: 50px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-soft);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.symbol-picker__grid button span {
  font-size: 22px;
  line-height: 1;
}

.symbol-picker__grid.is-emoji button span {
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.symbol-picker__grid button:hover,
.symbol-picker__grid button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
  box-shadow: 0 3px 10px color-mix(in srgb, var(--tools-accent) 18%, transparent);
  transform: translateY(-1px);
}

.symbol-picker__grid button:active {
  transform: scale(0.96);
}

.symbol-picker__grid button.is-copied {
  border-color: var(--tools-accent);
  background: var(--tools-accent);
  color: #fff;
}

.symbol-picker__feedback {
  position: fixed;
  z-index: 60;
  bottom: 24px;
  left: 50%;
  max-width: calc(100vw - 32px);
  padding: 9px 18px;
  border-radius: 8px;
  opacity: 0;
  background: rgb(15 23 42 / 88%);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
  transform: translate(-50%, 12px);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  white-space: nowrap;
}

.symbol-picker__feedback.is-visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

.symbol-picker__tooltip {
  position: fixed;
  z-index: 100;
  max-width: min(280px, calc(100vw - 24px));
  padding: 6px 9px;
  border-radius: 6px;
  background: rgb(28 30 34 / 96%);
  box-shadow: 0 5px 16px rgb(15 23 42 / 22%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  pointer-events: none;
  transform: translate(-50%, -100%);
}

@media (max-width: 720px) {
  .symbol-picker__grid {
    grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
    gap: 6px;
  }

  .symbol-picker__grid button {
    min-height: 46px;
  }

  .symbol-picker__grid button span {
    font-size: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .symbol-picker__category,
  .symbol-picker__grid button,
  .symbol-picker__feedback {
    transition: none;
  }
}
</style>
