<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCheck, IconCopy, IconSearch } from '@tabler/icons-vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

const props = defineProps<{ mode: 'symbols' | 'emoji' }>();
const query = ref('');
const copied = ref('');
const symbols = [
  '©',
  '®',
  '™',
  '℗',
  '§',
  '¶',
  '†',
  '‡',
  '•',
  '·',
  '…',
  '‰',
  '′',
  '″',
  '※',
  '★',
  '☆',
  '✓',
  '✔',
  '✕',
  '✦',
  '→',
  '←',
  '↑',
  '↓',
  '↔',
  '⇒',
  '⇐',
  '∞',
  '≈',
  '≠',
  '≤',
  '≥',
  '±',
  '×',
  '÷',
  '√',
  '∑',
  '∏',
  '∫',
  '°',
  '℃',
  '℉',
  '¥',
  '€',
  '£',
  '¢',
  '₿',
  '「',
  '」',
  '『',
  '』',
  '【',
  '】',
  '〈',
  '〉',
];
const emojis = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😂',
  '🥰',
  '😍',
  '🤩',
  '😊',
  '😎',
  '🤔',
  '😴',
  '😭',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '🤝',
  '👀',
  '❤️',
  '💛',
  '💚',
  '💙',
  '💜',
  '🔥',
  '✨',
  '🎉',
  '🎯',
  '🚀',
  '💡',
  '✅',
  '❌',
  '⚠️',
  '📌',
  '📎',
  '📝',
  '📅',
  '⏰',
  '🔒',
  '🔑',
  '🛠️',
  '💻',
  '📱',
  '🌍',
  '⭐',
  '🍀',
  '🐱',
  '🐶',
  '🌈',
  '☀️',
  '🌙',
];
const source = computed(() => (props.mode === 'symbols' ? symbols : emojis));
const filtered = computed(() =>
  source.value.filter((item) => !query.value || item.includes(query.value)),
);

async function copy(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  copied.value = value;
  window.setTimeout(() => {
    if (copied.value === value) copied.value = '';
  }, 1200);
}
</script>

<template>
  <ToolSection
    :title="mode === 'symbols' ? '特殊符号' : 'Emoji 表情'"
    description="点击任意字符即可复制。"
  >
    <div class="tool-stack">
      <label class="tool-symbol-search"
        ><IconSearch :size="17" aria-hidden="true" /><input
          v-model="query"
          :placeholder="mode === 'symbols' ? '搜索符号…' : '筛选 Emoji…'"
      /></label>
      <div class="tool-symbol-grid">
        <button
          v-for="item in filtered"
          :key="item"
          type="button"
          :title="`复制 ${item}`"
          @click="copy(item)"
        >
          <span>{{ item }}</span
          ><IconCheck v-if="copied === item" :size="13" aria-hidden="true" /><IconCopy
            v-else
            :size="13"
            aria-hidden="true"
          />
        </button>
      </div>
      <p v-if="!filtered.length" class="tool-status">没有匹配的字符。</p>
    </div>
  </ToolSection>
</template>
