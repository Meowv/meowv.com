<script setup lang="ts">
import { ref } from 'vue';
import { IconRefresh, IconSearch } from '@tabler/icons-vue';
import cnchar from 'cnchar';
import order from 'cnchar-order';
import ToolSection from '@/features/tools/components/ToolSection.vue';

interface StrokeItem {
  shape: string;
  name: string;
}

interface CharacterStrokeResult {
  character: string;
  strokes: StrokeItem[];
}

cnchar.use(order);

const quickCharacters = ['你', '好', '世', '界'];
const inputText = ref('');
const results = ref<CharacterStrokeResult[]>([]);
const error = ref('');
const animationRun = ref(0);

function normalizeStrokeValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function queryStroke(): void {
  const characters = Array.from(inputText.value)
    .filter((character) => /\p{Script=Han}/u.test(character))
    .slice(0, 20);

  if (!inputText.value.trim()) {
    error.value = '请输入要查询的汉字。';
    results.value = [];
    return;
  }
  if (!characters.length) {
    error.value = '请输入有效的汉字。';
    results.value = [];
    return;
  }

  try {
    const text = characters.join('');
    const shapes = cnchar.stroke(text, 'order', 'shape') as unknown[];
    const names = cnchar.stroke(text, 'order', 'name') as unknown[];
    results.value = characters.map((character, characterIndex) => {
      const characterShapes = normalizeStrokeValue(shapes[characterIndex]);
      const characterNames = normalizeStrokeValue(names[characterIndex]);
      return {
        character,
        strokes: characterShapes.map((shape, strokeIndex) => ({
          shape: shape.split('|')[0] ?? shape,
          name: characterNames[strokeIndex] ?? '未知笔画',
        })),
      };
    });
    error.value = '';
    animationRun.value += 1;
  } catch (cause) {
    results.value = [];
    error.value = cause instanceof Error ? `查询失败：${cause.message}` : '查询笔顺失败。';
  }
}

function useQuickCharacter(character: string): void {
  inputText.value = character;
  queryStroke();
}

function replay(): void {
  animationRun.value += 1;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  queryStroke();
}
</script>

<template>
  <div class="stroke-order-tool">
    <ToolSection title="汉字笔顺" description="查询汉字的标准笔画名称与书写顺序。">
      <div class="stroke-order-tool__input-row">
        <label class="stroke-order-tool__input">
          <span class="sr-only">要查询笔顺的汉字</span>
          <input
            v-model="inputText"
            type="text"
            maxlength="20"
            placeholder="请输入要查询的汉字（支持多个汉字）"
            @keydown="handleKeydown"
          />
        </label>
        <button
          type="button"
          class="tool-button tool-button--primary stroke-order-tool__query"
          @click="queryStroke"
        >
          <IconSearch :size="16" aria-hidden="true" />查询笔顺
        </button>
      </div>

      <div class="stroke-order-tool__quick-list">
        <span>快速选择：</span>
        <button
          v-for="character in quickCharacters"
          :key="character"
          type="button"
          @click="useQuickCharacter(character)"
        >
          {{ character }}
        </button>
      </div>

      <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
    </ToolSection>

    <ToolSection
      v-if="results.length"
      title="笔顺与书写演示"
      description="笔画按书写顺序依次呈现。"
      tone="output"
    >
      <template #actions>
        <button type="button" class="tool-button tool-button--secondary" @click="replay">
          <IconRefresh :size="15" aria-hidden="true" />重新演示
        </button>
      </template>

      <div :key="animationRun" class="stroke-order-tool__results">
        <article
          v-for="(result, resultIndex) in results"
          :key="`${result.character}-${resultIndex}`"
          class="stroke-order-tool__character"
        >
          <header>
            <strong>{{ result.character }}</strong>
            <span>{{ result.strokes.length ? `${result.strokes.length} 画` : '暂无数据' }}</span>
          </header>

          <ol v-if="result.strokes.length" class="stroke-order-tool__sequence">
            <li
              v-for="(stroke, index) in result.strokes"
              :key="`${result.character}-${index}`"
              :style="{ '--stroke-delay': `${index * 90}ms` }"
              :aria-label="`第 ${index + 1} 画，${stroke.name}`"
            >
              <small>{{ index + 1 }}</small>
              <b aria-hidden="true">{{ stroke.shape }}</b>
              <span>{{ stroke.name }}</span>
            </li>
          </ol>
          <p v-else>笔顺库暂未收录该汉字。</p>
        </article>
      </div>
    </ToolSection>
  </div>
</template>

<style scoped>
.stroke-order-tool {
  display: grid;
  gap: 14px;
}

.stroke-order-tool__input-row {
  display: flex;
  gap: 10px;
}

.stroke-order-tool__input {
  flex: 1;
}

.stroke-order-tool__input input {
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  background: var(--color-surface-solid);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.stroke-order-tool__input input:focus {
  border-color: color-mix(in srgb, var(--tools-accent) 52%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 9%, transparent);
}

.stroke-order-tool__query {
  min-width: 112px;
}

.stroke-order-tool__quick-list {
  display: flex;
  margin-top: 12px;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.stroke-order-tool__quick-list > span {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 650;
}

.stroke-order-tool__quick-list button {
  min-width: 32px;
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.stroke-order-tool__quick-list button:hover,
.stroke-order-tool__quick-list button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.stroke-order-tool__results {
  display: grid;
  gap: 12px;
}

.stroke-order-tool__character {
  display: grid;
  padding: 13px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: start;
  gap: 13px;
  background: var(--color-surface-solid);
}

.stroke-order-tool__character header {
  display: grid;
  min-height: 74px;
  border-right: 1px solid var(--color-border);
  place-items: center;
  align-content: center;
  gap: 4px;
}

.stroke-order-tool__character header strong {
  color: var(--tools-accent);
  font-size: 34px;
  line-height: 1;
}

.stroke-order-tool__character header span,
.stroke-order-tool__character > p {
  color: var(--color-text-muted);
  font-size: 9px;
}

.stroke-order-tool__character > p {
  margin: 27px 0 0;
}

.stroke-order-tool__sequence {
  display: flex;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
}

.stroke-order-tool__sequence li {
  position: relative;
  display: grid;
  width: 66px;
  min-height: 74px;
  padding: 7px 5px 5px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  place-items: center;
  align-content: center;
  gap: 2px;
  opacity: 0;
  background: var(--color-surface-soft);
  animation: stroke-order-enter 360ms ease-out forwards;
  animation-delay: var(--stroke-delay);
}

.stroke-order-tool__sequence li small {
  position: absolute;
  top: 5px;
  left: 6px;
  display: grid;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  place-items: center;
  background: color-mix(in srgb, var(--tools-accent) 12%, var(--color-surface-solid));
  color: var(--tools-accent);
  font-size: 8px;
  font-weight: 750;
}

.stroke-order-tool__sequence li b {
  color: var(--color-text);
  font-size: 25px;
  font-weight: 500;
  line-height: 1;
}

.stroke-order-tool__sequence li span {
  overflow: hidden;
  max-width: 100%;
  color: var(--color-text-muted);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes stroke-order-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 600px) {
  .stroke-order-tool__input-row {
    flex-direction: column;
  }

  .stroke-order-tool__query {
    width: 100%;
  }

  .stroke-order-tool__character {
    grid-template-columns: minmax(0, 1fr);
  }

  .stroke-order-tool__character header {
    min-height: 60px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .stroke-order-tool__sequence li {
    width: 58px;
    min-height: 68px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stroke-order-tool__quick-list button {
    transition: none;
  }

  .stroke-order-tool__sequence li {
    opacity: 1;
    animation: none;
  }
}
</style>
