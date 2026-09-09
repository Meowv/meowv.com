<script setup lang="ts">
import { computed } from 'vue';
import { IconArrowBackUp, IconArrowForwardUp, IconEraser, IconWand } from '@tabler/icons-vue';
import {
  FACES,
  type CubeColorScheme,
  type Face,
  type Facelet,
  type ValidationIssue,
} from '../types';
import { FACE_OFFSETS } from '../core/constants';

const props = defineProps<{
  facelets: readonly Facelet[];
  colorScheme: CubeColorScheme;
  selectedColor: Face;
  activeFace: Face;
  counts: Record<Face, number>;
  issues: readonly ValidationIssue[];
  canAutoFill: boolean;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  'update:selected-color': [face: Face];
  'update:active-face': [face: Face];
  paint: [face: Face, index: number, color: Facelet];
  clear: [];
  'auto-fill': [];
  undo: [];
  redo: [];
}>();

const faceNames: Record<Face, string> = {
  U: '上面',
  R: '右面',
  F: '前面',
  D: '下面',
  L: '左面',
  B: '后面',
};

const completedCount = computed(() => props.facelets.filter(Boolean).length);
const paletteLabel = (face: Face): string =>
  `${faceNames[face]}中心色，已使用 ${props.counts[face]} / 9`;

const issueKeys = computed(
  () =>
    new Set(
      props.issues
        .flatMap((issue) => issue.stickerRefs ?? [])
        .map((item) => `${item.face}-${item.index}`),
    ),
);

function faceletsFor(face: Face): Facelet[] {
  return props.facelets.slice(FACE_OFFSETS[face], FACE_OFFSETS[face] + 9);
}
</script>

<template>
  <div class="cube-net-editor">
    <div class="cube-input-guide">
      <strong>先看中心块，再涂同色贴纸</strong>
      <p>
        中心块决定这一面的颜色。点击一个中心色，再点击展开图中同色的贴纸；中心块不能修改。
        右键可清除误填。
      </p>
      <span>已录入 {{ completedCount }} / 54 格</span>
    </div>
    <div class="cube-palette" role="group" aria-label="贴纸颜色">
      <button
        v-for="face in FACES"
        :key="face"
        type="button"
        :class="{ 'is-active': selectedColor === face, 'is-full': counts[face] >= 9 }"
        :aria-pressed="selectedColor === face"
        :title="paletteLabel(face)"
        :aria-label="paletteLabel(face)"
        @click="emit('update:selected-color', face)"
      >
        <span :style="{ '--sticker-color': colorScheme[face] }">{{ face }}</span>
        <small>{{ counts[face] }}/9</small>
      </button>
    </div>

    <div class="cube-face-tabs" role="group" aria-label="移动端录入面">
      <button
        v-for="face in FACES"
        :key="face"
        type="button"
        :class="{ 'is-active': activeFace === face }"
        :aria-pressed="activeFace === face"
        @click="emit('update:active-face', face)"
      >
        {{ face }}
      </button>
    </div>

    <div class="cube-net" role="group" aria-label="六面展开图">
      <div
        v-for="face in FACES"
        :key="face"
        class="cube-net__face"
        :class="[
          `cube-net__face--${face.toLowerCase()}`,
          { 'is-mobile-active': activeFace === face },
        ]"
        :aria-label="faceNames[face]"
      >
        <span class="cube-net__face-label"
          >{{ face }} <small>{{ faceNames[face] }}</small></span
        >
        <div class="cube-net__grid">
          <button
            v-for="(color, index) in faceletsFor(face)"
            :key="index"
            type="button"
            :disabled="index === 4"
            :class="{
              'is-empty': !color,
              'is-issue': issueKeys.has(`${face}-${index}`),
            }"
            :style="{ '--sticker-color': color ? colorScheme[color] : undefined }"
            :aria-label="`${faceNames[face]}第 ${index + 1} 格，${color ?? '未录入'}`"
            @click="emit('paint', face, index, selectedColor)"
            @contextmenu.prevent="emit('paint', face, index, null)"
          >
            <span>{{ color ? `${color}` : '·' }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="cube-net-actions" role="group" aria-label="录入操作">
      <button type="button" :disabled="!canUndo" @click="emit('undo')">
        <IconArrowBackUp :size="15" aria-hidden="true" />撤销
      </button>
      <button type="button" :disabled="!canRedo" @click="emit('redo')">
        <IconArrowForwardUp :size="15" aria-hidden="true" />重做
      </button>
      <button type="button" @click="emit('clear')">
        <IconEraser :size="15" aria-hidden="true" />清空
      </button>
      <button type="button" :disabled="!canAutoFill" @click="emit('auto-fill')">
        <IconWand :size="15" aria-hidden="true" />自动补全
      </button>
    </div>
  </div>
</template>
