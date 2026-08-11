<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { IconCheck } from '@tabler/icons-vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';

interface SymbolCategory {
  id: string;
  name: string;
  symbols: string[];
}

const categories: SymbolCategory[] = [
  {
    id: 'popular',
    name: '热门符号',
    symbols: [
      '♥',
      '★',
      '☺',
      '♫',
      '☀',
      '☂',
      '☮',
      '☯',
      '✓',
      '✗',
      'ღ',
      '•',
      '⁂',
      '€',
      '™',
      '↑',
      '→',
      '↓',
      '⇝',
      '√',
      '∞',
      '░',
      '▲',
      '▶',
      '◀',
      '●',
      '☠',
      '☢',
      '☣',
      '☪',
    ],
  },
  {
    id: 'emoji',
    name: '表情符号',
    symbols: [
      '☹',
      '☺',
      '☻',
      '😀',
      '😁',
      '😂',
      '😃',
      '😄',
      '😅',
      '😆',
      '😇',
      '😈',
      '😉',
      '😊',
      '😋',
      '😌',
      '😍',
      '😎',
      '😏',
      '😐',
    ],
  },
  {
    id: 'heart',
    name: '心形符号',
    symbols: [
      '♡',
      '♥',
      '❤',
      '❥',
      '❣',
      '❦',
      '❧',
      'ღ',
      '💕',
      '💖',
      '💗',
      '💘',
      '💙',
      '💚',
      '💛',
      '💜',
      '💝',
      '💞',
      '💟',
    ],
  },
  {
    id: 'arrow',
    name: '箭头符号',
    symbols: [
      '←',
      '→',
      '↑',
      '↓',
      '↔',
      '↕',
      '↖',
      '↗',
      '↘',
      '↙',
      '↚',
      '↛',
      '↜',
      '↝',
      '↞',
      '↟',
      '⇒',
      '⇐',
      '⇑',
      '⇓',
      '⇔',
      '⇕',
      '⇖',
      '⇗',
      '⇘',
      '⇙',
      '➜',
      '➤',
      '➢',
    ],
  },
  {
    id: 'math',
    name: '数学符号',
    symbols: [
      '∀',
      '∂',
      '∃',
      '∅',
      '∇',
      '∈',
      '∉',
      '∋',
      '∏',
      '∑',
      '−',
      '∓',
      '∗',
      '∘',
      '√',
      '∝',
      '∞',
      '∠',
      '∧',
      '∨',
      '∩',
      '∪',
      '∫',
      '∴',
      '∼',
      '≅',
      '≈',
      '≠',
      '≡',
      '≤',
      '≥',
      '⊂',
      '⊃',
      '⊆',
      '⊇',
      '⊕',
      '⊗',
      '⊥',
      '⋅',
      '⌈',
      '⌉',
      '⌊',
      '⌋',
      '∑',
      '∏',
      '∫',
    ],
  },
  {
    id: 'currency',
    name: '货币符号',
    symbols: [
      '$',
      '¢',
      '£',
      '¤',
      '¥',
      '฿',
      '₡',
      '₢',
      '₣',
      '₤',
      '₥',
      '₦',
      '₧',
      '₨',
      '₩',
      '₪',
      '₫',
      '€',
      '₭',
      '₮',
      '₯',
      '₰',
      '₱',
      '₲',
      '₳',
      '₴',
      '₵',
      '₸',
      '₹',
      '₺',
      '₽',
      '₾',
      '₿',
    ],
  },
  {
    id: 'music',
    name: '音乐符号',
    symbols: ['♩', '♪', '♫', '♬', '♭', '♮', '♯', '𝄞', '𝄢', '𝄪', '𝄫'],
  },
  {
    id: 'chess',
    name: '国际象棋符号',
    symbols: ['♔', '♕', '♖', '♗', '♘', '♙', '♚', '♛', '♜', '♝', '♞', '♟'],
  },
  {
    id: 'weather',
    name: '天气符号',
    symbols: ['☀', '☁', '☂', '☃', '☄', '☼', '☽', '☾', '❄', '⚡', '☔', '🌈'],
  },
  {
    id: 'card',
    name: '扑克牌符号',
    symbols: [
      '♠',
      '♥',
      '♦',
      '♣',
      '🂡',
      '🂢',
      '🂣',
      '🂤',
      '🂥',
      '🂦',
      '🂧',
      '🂨',
      '🂩',
      '🂪',
      '🂫',
      '🂬',
      '🂭',
      '🂮',
    ],
  },
  {
    id: 'dice',
    name: '骰子符号',
    symbols: ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '🎲'],
  },
  {
    id: 'unit',
    name: '单位符号',
    symbols: [
      '°',
      '℃',
      '℉',
      'µ',
      'Ω',
      '℧',
      '℥',
      '℮',
      '℞',
      '℗',
      '℠',
      '™',
      '№',
      '℀',
      '℁',
      'ℂ',
      '℄',
      '℆',
      'ℇ',
    ],
  },
  {
    id: 'number',
    name: '数字符号',
    symbols: [
      '①',
      '②',
      '③',
      '④',
      '⑤',
      '⑥',
      '⑦',
      '⑧',
      '⑨',
      '⑩',
      '⑪',
      '⑫',
      '⑬',
      '⑭',
      '⑮',
      '⑯',
      '⑰',
      '⑱',
      '⑲',
      '⑳',
      'Ⅰ',
      'Ⅱ',
      'Ⅲ',
      'Ⅳ',
      'Ⅴ',
      'Ⅵ',
      'Ⅶ',
      'Ⅷ',
      'Ⅸ',
      'Ⅹ',
      'Ⅺ',
      'Ⅻ',
    ],
  },
  {
    id: 'tech',
    name: '技术符号',
    symbols: [
      '⌘',
      '⌥',
      '⇧',
      '⌃',
      '⎋',
      '⌫',
      '⌦',
      '⏎',
      '⌤',
      '␣',
      '⎇',
      '⇪',
      '⌨',
      '⌚',
      '⌛',
      '✉',
      '✎',
      '✏',
      '✂',
      '✄',
      '⚙',
      '🔒',
      '🔓',
    ],
  },
  {
    id: 'zodiac',
    name: '星座符号',
    symbols: ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '⛎'],
  },
  {
    id: 'check',
    name: '打勾符号',
    symbols: [
      '✓',
      '✔',
      '✗',
      '✘',
      '✓',
      '✕',
      '✖',
      '✚',
      '✱',
      '❌',
      '❎',
      '❓',
      '❔',
      '❕',
      '❗',
      '✔️',
      '✖️',
      '❣️',
    ],
  },
];

const copiedKey = ref('');
const feedback = ref('');
let copiedTimer: number | null = null;
let feedbackTimer: number | null = null;
let hashScrollFrame: number | null = null;

function restoreHashPosition(): void {
  const targetId = window.location.hash.slice(1);
  const categoryId = targetId.replace(/^symbol-/, '');
  if (targetId !== `symbol-${categoryId}` || !categories.some(({ id }) => id === categoryId)) {
    return;
  }

  hashScrollFrame = window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
    hashScrollFrame = null;
  });
}

function scrollToCategory(categoryId: string): void {
  const targetId = `symbol-${categoryId}`;
  document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
  window.history.replaceState(window.history.state, '', `#${targetId}`);
}

async function copySymbol(symbol: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(symbol);
    copiedKey.value = key;
    feedback.value = `已复制 ${symbol}`;

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

onMounted(restoreHashPosition);

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
  if (hashScrollFrame !== null) window.cancelAnimationFrame(hashScrollFrame);
});
</script>

<template>
  <ToolSection title="特殊符号" description="点击任意符号即可复制到剪贴板。">
    <nav class="special-symbols__nav" aria-label="符号分类快捷导航">
      <a
        v-for="category in categories"
        :key="category.id"
        :href="`#symbol-${category.id}`"
        @click.prevent="scrollToCategory(category.id)"
      >
        {{ category.name }}
      </a>
    </nav>

    <div class="special-symbols__categories">
      <section
        v-for="category in categories"
        :id="`symbol-${category.id}`"
        :key="category.id"
        class="special-symbols__section"
        :aria-labelledby="`symbol-${category.id}-title`"
      >
        <h3 :id="`symbol-${category.id}-title`">{{ category.name }}</h3>
        <div class="special-symbols__grid">
          <button
            v-for="(symbol, index) in category.symbols"
            :key="`${category.id}-${index}`"
            type="button"
            :class="{ 'is-copied': copiedKey === `${category.id}-${index}` }"
            :aria-label="`复制 ${symbol}`"
            :title="`复制 ${symbol}`"
            @click="copySymbol(symbol, `${category.id}-${index}`)"
          >
            <IconCheck
              v-if="copiedKey === `${category.id}-${index}`"
              :size="18"
              aria-hidden="true"
            />
            <span v-else>{{ symbol }}</span>
          </button>
        </div>
      </section>
    </div>

    <div class="special-symbols__feedback" :class="{ 'is-visible': feedback }" role="status">
      {{ feedback }}
    </div>
  </ToolSection>
</template>

<style scoped>
.special-symbols__nav {
  display: flex;
  margin-bottom: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
  gap: 7px;
}

.special-symbols__nav a {
  display: inline-flex;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  align-items: center;
  background: var(--color-surface-soft);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 650;
  text-decoration: none;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}

.special-symbols__nav a:hover,
.special-symbols__nav a:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  background: var(--tools-accent);
  color: #fff;
}

.special-symbols__categories {
  display: grid;
  gap: 24px;
}

.special-symbols__section {
  scroll-margin-top: calc(var(--header-height) + 16px);
}

.special-symbols__section h3 {
  margin: 0 0 11px;
  padding-left: 9px;
  border-left: 3px solid var(--tools-accent);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.25;
}

.special-symbols__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 7px;
}

.special-symbols__grid button {
  display: inline-flex;
  min-width: 0;
  min-height: 46px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 9px;
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

.special-symbols__grid button span {
  font-size: 20px;
  line-height: 1;
}

.special-symbols__grid button:hover,
.special-symbols__grid button:focus-visible {
  border-color: var(--tools-accent);
  outline: none;
  background: color-mix(in srgb, var(--tools-accent) 10%, var(--color-surface-solid));
  box-shadow: 0 3px 10px color-mix(in srgb, var(--tools-accent) 18%, transparent);
  transform: translateY(-1px);
}

.special-symbols__grid button:active {
  transform: scale(0.96);
}

.special-symbols__grid button.is-copied {
  border-color: var(--tools-accent);
  background: var(--tools-accent);
  color: #fff;
}

.special-symbols__feedback {
  position: fixed;
  z-index: 60;
  bottom: 24px;
  left: 50%;
  max-width: calc(100vw - 32px);
  padding: 9px 18px;
  border-radius: 999px;
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

.special-symbols__feedback.is-visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (max-width: 600px) {
  .special-symbols__nav {
    margin-bottom: 18px;
  }

  .special-symbols__categories {
    gap: 21px;
  }

  .special-symbols__grid {
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 6px;
  }

  .special-symbols__grid button {
    min-height: 42px;
  }

  .special-symbols__grid button span {
    font-size: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .special-symbols__nav a,
  .special-symbols__grid button,
  .special-symbols__feedback {
    transition: none;
  }
}
</style>
