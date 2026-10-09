<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-vue';
import FloorplanSearch from './FloorplanSearch.vue';
import { LIB } from './catalog';
import { furnitureSvg } from './svg';
import type { LibraryItem } from './types';
const props = defineProps<{ collapsed: boolean; disabled: boolean }>();
const emit = defineEmits<{
  toggle: [];
  add: [item: LibraryItem];
  drop: [item: LibraryItem, x: number, y: number];
  hover: [item: LibraryItem | null, x: number, y: number];
}>();
const category = ref('客厅');
const query = ref('');
const entries = computed(() =>
  LIB.filter((c) => !category.value || c.cat === category.value)
    .flatMap((c) => c.items)
    .filter((i) => i[1].includes(query.value.trim())),
);
let gesture: {
  item: LibraryItem;
  x: number;
  y: number;
  id: number;
  dragging: boolean;
  scrolling: boolean;
} | null = null;
let suppressClick = false;
let clickTimer: ReturnType<typeof setTimeout> | undefined;
const icons = new Map<LibraryItem, string>();
function icon(item: LibraryItem) {
  if (!icons.has(item))
    icons.set(
      item,
      furnitureSvg({
        id: 'preview',
        type: item[0],
        name: item[1],
        w: item[2],
        d: item[3],
        color: item[4],
        cx: 0,
        cy: 0,
        rot: 0,
      }),
    );
  return icons.get(item)!;
}
function down(item: LibraryItem, event: PointerEvent) {
  if (props.disabled || event.button !== 0) return;
  gesture = {
    item,
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
    dragging: false,
    scrolling: false,
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (!gesture.dragging && !gesture.scrolling && Math.hypot(dx, dy) > 9) {
    if (Math.abs(dx) > Math.abs(dy) || dy > 0) gesture.scrolling = true;
    else gesture.dragging = true;
  }
  if (gesture.dragging) {
    event.preventDefault();
    emit('hover', gesture.item, event.clientX, event.clientY);
  }
}
function cleanup() {
  gesture = null;
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', cancel);
  emit('hover', null, 0, 0);
}
function up(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.id) return;
  suppressClick = gesture.dragging || gesture.scrolling;
  if (gesture.dragging) emit('drop', gesture.item, event.clientX, event.clientY);
  cleanup();
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    suppressClick = false;
  }, 100);
}
function cancel() {
  suppressClick = true;
  cleanup();
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    suppressClick = false;
  }, 100);
}
function click(item: LibraryItem) {
  if (!suppressClick && !props.disabled) emit('add', item);
}
onBeforeUnmount(() => {
  cleanup();
  clearTimeout(clickTimer);
});
</script>
<!-- eslint-disable vue/no-v-html -- furniture SVG markup is generated solely from the fixed internal catalogue. -->
<template>
  <section class="fp-library" :class="{ 'is-collapsed': collapsed }" aria-label="家具库">
    <div class="fp-library-heading">
      <strong>家具库</strong
      ><label class="fp-library-category"
        ><span class="fp-library-category__label">分类</span
        ><select v-model="category" aria-label="家具分类">
          <option value="">全部分类</option>
          <option v-for="c in LIB" :key="c.cat" :value="c.cat">{{ c.cat }}</option></select
        ><IconChevronDown class="fp-library-category__chevron" :size="17" aria-hidden="true"
      /></label>
      <FloorplanSearch v-model="query" class="fp-library-search" label="搜索家具" />
      <button
        :title="collapsed ? '展开家具库' : '收起家具库'"
        :aria-label="collapsed ? '展开家具库' : '收起家具库'"
        :aria-expanded="!collapsed"
        @click="emit('toggle')"
      >
        <component :is="collapsed ? IconChevronUp : IconChevronDown" :size="18" />
      </button>
    </div>
    <div v-show="!collapsed" class="fp-library-items">
      <button
        v-for="(item, index) in entries"
        :key="`${item[0]}-${index}`"
        class="fp-furniture-card"
        :disabled="disabled"
        @pointerdown="down(item, $event)"
        @click="click(item)"
      >
        <svg
          :viewBox="`${-item[2] / 2 - 100} ${-item[3] / 2 - 100} ${item[2] + 200} ${item[3] + 200}`"
          aria-hidden="true"
          v-html="icon(item)"
        /><strong>{{ item[1] }}</strong
        ><small>{{ item[2] }} × {{ item[3] }} mm</small>
      </button>
      <p v-if="!entries.length" class="fp-empty">没有找到家具，试试其他分类或名称。</p>
    </div>
  </section>
</template>
