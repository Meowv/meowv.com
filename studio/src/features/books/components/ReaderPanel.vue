<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import { nextTick, onMounted, ref, watch } from 'vue';
import type { BookLayoutKind, BookLocator, ReaderLayoutProfile, TocItem } from '../types/reader';
import TocTree from './TocTree.vue';

const props = defineProps<{
  mode: 'toc' | 'settings';
  toc: TocItem[];
  layout: BookLayoutKind;
  profile: ReaderLayoutProfile;
}>();

const emit = defineEmits<{
  close: [];
  navigate: [locator: BookLocator];
  apply: [profile: ReaderLayoutProfile];
}>();
const panel = ref<HTMLElement | null>(null);
const draftProfile = ref({ ...props.profile });

watch(
  () => props.profile,
  (profile) => {
    draftProfile.value = { ...profile };
  },
  { deep: true },
);

onMounted(async () => {
  await nextTick();
  panel.value?.focus();
});

function update<Key extends keyof ReaderLayoutProfile>(
  key: Key,
  value: ReaderLayoutProfile[Key],
): void {
  draftProfile.value = { ...draftProfile.value, [key]: value };
  emit('apply', draftProfile.value);
}

function updateRange<Key extends 'fontSize' | 'lineHeight' | 'pageMargin'>(
  key: Key,
  event: Event,
): void {
  draftProfile.value = {
    ...draftProfile.value,
    [key]: Number((event.target as HTMLInputElement).value),
  };
}

function applyRange(): void {
  emit('apply', draftProfile.value);
}
</script>

<template>
  <aside
    ref="panel"
    class="books-reader-panel"
    :aria-label="mode === 'toc' ? '书籍目录' : '排版设置'"
    tabindex="-1"
    @keydown.esc.stop="$emit('close')"
  >
    <header>
      <strong>{{ mode === 'toc' ? '目录' : '排版' }}</strong>
      <button type="button" aria-label="关闭面板" @click="$emit('close')">
        <IconX :size="18" />
      </button>
    </header>

    <div v-if="mode === 'toc'" class="books-reader-panel__toc">
      <p v-if="!toc.length">这本书没有提供目录。</p>
      <TocTree :items="toc" @navigate="$emit('navigate', $event)" />
    </div>

    <div v-else class="books-reader-panel__settings">
      <p v-if="layout === 'fixed'">固定版式书籍保留原始页面排版。</p>
      <template v-else>
        <fieldset class="books-reader-panel__choices books-reader-panel__choices--font">
          <legend>字体</legend>
          <button
            v-for="option in [
              ['publisher', '原书', '沿用书籍字体'],
              ['serif', '衬线', '宋体风格'],
              ['sans', '无衬线', '黑体风格'],
            ] as const"
            :key="option[0]"
            type="button"
            :class="{ 'is-active': draftProfile.fontFamily === option[0] }"
            :aria-pressed="draftProfile.fontFamily === option[0]"
            @click="update('fontFamily', option[0])"
          >
            <strong>{{ option[1] }}</strong>
            <small>{{ option[2] }}</small>
          </button>
        </fieldset>
        <label class="books-reader-panel__range-label">
          <span
            >字号 <b>{{ draftProfile.fontSize }} px</b></span
          >
          <input
            type="range"
            aria-label="字号"
            min="14"
            max="28"
            step="1"
            :value="draftProfile.fontSize"
            @input="updateRange('fontSize', $event)"
            @change="applyRange"
          />
          <small class="books-reader-panel__range-hint"><span>14 px</span><span>28 px</span></small>
        </label>
        <label class="books-reader-panel__range-label">
          <span
            >行距 <b>{{ draftProfile.lineHeight.toFixed(2) }}×</b></span
          >
          <input
            type="range"
            aria-label="行距"
            min="1.35"
            max="2.2"
            step="0.05"
            :value="draftProfile.lineHeight"
            @input="updateRange('lineHeight', $event)"
            @change="applyRange"
          />
          <small class="books-reader-panel__range-hint"><span>1.35×</span><span>2.20×</span></small>
        </label>
        <label class="books-reader-panel__range-label">
          <span
            >页边距 <b>{{ draftProfile.pageMargin }}%</b></span
          >
          <input
            type="range"
            aria-label="页边距"
            min="5"
            max="18"
            step="1"
            :value="draftProfile.pageMargin"
            @input="updateRange('pageMargin', $event)"
            @change="applyRange"
          />
          <small class="books-reader-panel__range-hint"><span>5%</span><span>18%</span></small>
        </label>
        <fieldset class="books-reader-panel__choices books-reader-panel__choices--paper">
          <legend>纸张</legend>
          <button
            v-for="option in [
              ['paper', '白纸'],
              ['warm', '暖纸'],
              ['night', '夜读'],
            ] as const"
            :key="option[0]"
            type="button"
            :class="{ 'is-active': draftProfile.theme === option[0] }"
            :aria-pressed="draftProfile.theme === option[0]"
            @click="update('theme', option[0])"
          >
            {{ option[1] }}
          </button>
        </fieldset>
      </template>
    </div>
  </aside>
</template>
