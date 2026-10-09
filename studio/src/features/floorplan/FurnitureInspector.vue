<script setup lang="ts">
import {
  IconCopy,
  IconTrash,
  IconRotateClockwise,
  IconRotate,
  IconArrowBarToUp,
  IconArrowBarToDown,
} from '@tabler/icons-vue';
import type { Furniture } from './types';
const props = defineProps<{ furniture: Furniture; roomName: string }>();
const emit = defineEmits<{
  patch: [patch: Partial<Furniture>];
  duplicate: [];
  remove: [];
  order: [top: boolean];
  rotate: [degrees: number];
}>();
function number(key: 'w' | 'd' | 'cx' | 'cy' | 'rot', event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number(input.value);
  const min = key === 'w' || key === 'd' ? 50 : key === 'rot' ? -3600 : -100000;
  const max = key === 'w' || key === 'd' ? 20000 : key === 'rot' ? 3600 : 100000;
  if (!input.value.trim() || !Number.isFinite(value) || value < min || value > max) {
    input.value = String(props.furniture[key]);
    return;
  }
  emit('patch', {
    [key]: key === 'rot' ? ((Math.round(value) % 360) + 360) % 360 : Math.round(value),
  });
}
function text(key: 'name' | 'color', event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.trim();
  if ((key === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) || (key === 'name' && !value)) {
    input.value = props.furniture[key];
    return;
  }
  emit('patch', { [key]: value.slice(0, key === 'name' ? 120 : 7) });
}
</script>
<template>
  <div class="fp-inspector-heading">
    <h2>{{ furniture.name }}</h2>
    <p>{{ roomName }} / 家具</p>
  </div>
  <label class="fp-field"
    >名称<input
      :key="`${furniture.id}-name`"
      :value="furniture.name"
      maxlength="120"
      @change="text('name', $event)"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
  /></label>
  <fieldset>
    <legend>尺寸 <small>(mm)</small></legend>
    <div class="fp-field-pair">
      <label class="fp-field"
        >宽度<input
          type="number"
          min="50"
          max="20000"
          step="10"
          :value="furniture.w"
          @change="number('w', $event)" /></label
      ><label class="fp-field"
        >深度<input
          type="number"
          min="50"
          max="20000"
          step="10"
          :value="furniture.d"
          @change="number('d', $event)"
      /></label>
    </div>
  </fieldset>
  <fieldset>
    <legend>位置 <small>(mm)</small></legend>
    <div class="fp-field-pair">
      <label class="fp-field"
        >中心 X<input
          type="number"
          min="-100000"
          max="100000"
          step="10"
          :value="furniture.cx"
          @change="number('cx', $event)" /></label
      ><label class="fp-field"
        >中心 Y<input
          type="number"
          min="-100000"
          max="100000"
          step="10"
          :value="furniture.cy"
          @change="number('cy', $event)"
      /></label>
    </div>
  </fieldset>
  <fieldset>
    <legend>旋转</legend>
    <div class="fp-rotation">
      <input
        aria-label="旋转角度"
        type="number"
        step="15"
        :value="furniture.rot"
        @change="number('rot', $event)"
      /><span>°</span
      ><button title="逆时针旋转 90°" aria-label="逆时针旋转 90°" @click="emit('rotate', -90)">
        <IconRotate :size="18" /></button
      ><button title="顺时针旋转 90°" aria-label="顺时针旋转 90°" @click="emit('rotate', 90)">
        <IconRotateClockwise :size="18" />
      </button>
    </div>
  </fieldset>
  <fieldset>
    <legend>颜色</legend>
    <div class="fp-color">
      <input
        aria-label="家具颜色"
        type="color"
        :value="furniture.color"
        @change="text('color', $event)"
      /><input
        aria-label="十六进制颜色"
        :value="furniture.color.toUpperCase()"
        maxlength="7"
        @change="text('color', $event)"
      />
    </div>
  </fieldset>
  <p class="fp-muted">
    占地约 {{ ((furniture.w * furniture.d) / 1e6).toFixed(2) }} m² · 高度随家具类型固定
  </p>
  <div class="fp-inspector-actions">
    <button @click="emit('duplicate')"><IconCopy :size="18" />复制</button
    ><button class="fp-danger" @click="emit('remove')"><IconTrash :size="18" />删除</button
    ><button @click="emit('order', true)"><IconArrowBarToUp :size="17" />置顶</button
    ><button @click="emit('order', false)"><IconArrowBarToDown :size="17" />置底</button>
  </div>
  <p class="fp-muted">拖动家具调整位置；角点调整尺寸。置顶、置底仅改变平面图的叠放顺序。</p>
</template>
