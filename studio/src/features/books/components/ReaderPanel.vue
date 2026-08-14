<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import { nextTick, onMounted, ref } from 'vue';
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

onMounted(async () => {
  await nextTick();
  panel.value?.focus();
});

function update<Key extends keyof ReaderLayoutProfile>(
  key: Key,
  value: ReaderLayoutProfile[Key],
): void {
  emit('apply', { ...props.profile, [key]: value });
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
        <label>
          <span>字体</span>
          <select
            :value="profile.fontFamily"
            @change="
              update(
                'fontFamily',
                ($event.target as HTMLSelectElement).value as ReaderLayoutProfile['fontFamily'],
              )
            "
          >
            <option value="publisher">原书字体</option>
            <option value="serif">衬线字体</option>
            <option value="sans">无衬线字体</option>
          </select>
        </label>
        <label>
          <span
            >字号 <b>{{ profile.fontSize }}px</b></span
          >
          <input
            type="range"
            min="14"
            max="28"
            step="1"
            :value="profile.fontSize"
            @change="update('fontSize', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label>
          <span
            >行距 <b>{{ profile.lineHeight.toFixed(2) }}</b></span
          >
          <input
            type="range"
            min="1.35"
            max="2.2"
            step="0.05"
            :value="profile.lineHeight"
            @change="update('lineHeight', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label>
          <span
            >页边距 <b>{{ profile.pageMargin }}%</b></span
          >
          <input
            type="range"
            min="5"
            max="18"
            step="1"
            :value="profile.pageMargin"
            @change="update('pageMargin', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <fieldset>
          <legend>纸张</legend>
          <button
            v-for="option in [
              ['paper', '白纸'],
              ['warm', '暖纸'],
              ['night', '夜读'],
            ] as const"
            :key="option[0]"
            type="button"
            :class="{ 'is-active': profile.theme === option[0] }"
            @click="update('theme', option[0])"
          >
            {{ option[1] }}
          </button>
        </fieldset>
      </template>
    </div>
  </aside>
</template>
