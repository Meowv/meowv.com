<script setup lang="ts">
import { IconHistory, IconRestore, IconTrash } from '@tabler/icons-vue';
import { DEFAULT_COLOR_SCHEME } from '../core/constants';
import { FACES, type CubeHistoryItem, type CubePreferences, type Face } from '../types';

const props = defineProps<{
  preferences: CubePreferences;
  history: readonly CubeHistoryItem[];
}>();

const emit = defineEmits<{
  'update:preferences': [preferences: CubePreferences];
  'load-history': [item: CubeHistoryItem];
  'remove-history': [id: string];
  'clear-history': [];
}>();

const faceNames: Record<Face, string> = {
  U: '上面',
  R: '右面',
  F: '前面',
  D: '下面',
  L: '左面',
  B: '后面',
};
const sourceNames: Record<CubeHistoryItem['source'], string> = {
  manual: '手动录入',
  state: '状态字符串',
  scramble: '随机打乱',
};

function updatePreference<Key extends keyof CubePreferences>(
  key: Key,
  value: CubePreferences[Key],
): void {
  emit('update:preferences', { ...props.preferences, [key]: value });
}

function updateColor(face: Face, value: string): void {
  updatePreference('colorScheme', { ...props.preferences.colorScheme, [face]: value });
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
</script>

<template>
  <div class="cube-settings">
    <section>
      <header><h3>显示与操作</h3></header>
      <label class="cube-setting-check">
        <input
          type="checkbox"
          :checked="preferences.teachingView"
          @change="updatePreference('teachingView', ($event.target as HTMLInputElement).checked)"
        />
        教学模式固定观察视角
      </label>
      <label class="cube-setting-check">
        <input
          type="checkbox"
          :checked="preferences.showFaceLabels"
          @change="updatePreference('showFaceLabels', ($event.target as HTMLInputElement).checked)"
        />
        显示 U / F / R 面标签
      </label>
      <label class="cube-setting-check">
        <input
          type="checkbox"
          :checked="preferences.showMoveArrows"
          @change="updatePreference('showMoveArrows', ($event.target as HTMLInputElement).checked)"
        />
        显示动作方向提示
      </label>
    </section>

    <section>
      <header>
        <h3>每个面的显示颜色</h3>
        <button type="button" @click="updatePreference('colorScheme', { ...DEFAULT_COLOR_SCHEME })">
          <IconRestore :size="14" aria-hidden="true" />恢复默认
        </button>
      </header>
      <div class="cube-color-settings">
        <label v-for="face in FACES" :key="face">
          <input
            type="color"
            :value="preferences.colorScheme[face]"
            :aria-label="`${face} 面颜色`"
            @input="updateColor(face, ($event.target as HTMLInputElement).value)"
          />
          <span>{{ face }} · {{ faceNames[face] }}中心</span>
        </label>
      </div>
    </section>

    <section class="cube-history">
      <header>
        <h3><IconHistory :size="15" aria-hidden="true" />最近还原</h3>
        <button v-if="history.length" type="button" @click="emit('clear-history')">清空</button>
      </header>
      <p v-if="!history.length" class="cube-settings__empty">还没有本地还原记录。</p>
      <article v-for="item in history" :key="item.id">
        <button type="button" class="cube-history__main" @click="emit('load-history', item)">
          <strong>{{ item.moveCount }} 步</strong>
          <span>{{ formatDate(item.createdAt) }} · {{ sourceNames[item.source] }}</span>
          <small>{{ item.solution }}</small>
        </button>
        <button
          type="button"
          title="删除记录"
          :aria-label="`删除 ${formatDate(item.createdAt)} 的还原记录`"
          @click="emit('remove-history', item.id)"
        >
          <IconTrash :size="14" aria-hidden="true" />
        </button>
      </article>
    </section>
  </div>
</template>
