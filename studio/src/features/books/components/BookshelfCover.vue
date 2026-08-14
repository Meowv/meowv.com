<script setup lang="ts">
import { IconBook2 } from '@tabler/icons-vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  blob?: Blob;
  alt: string;
}>();

const host = ref<HTMLElement | null>(null);
const source = ref('');
let observer: IntersectionObserver | null = null;
let visible = false;

function release(): void {
  if (source.value) URL.revokeObjectURL(source.value);
  source.value = '';
}

function load(): void {
  if (!visible || source.value || !props.blob) return;
  source.value = URL.createObjectURL(props.blob);
}

function observe(): void {
  observer?.disconnect();
  const element = host.value;
  if (!element) return;
  if (!('IntersectionObserver' in globalThis)) {
    visible = true;
    load();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) load();
      else release();
    },
    { rootMargin: '240px 0px' },
  );
  observer.observe(element);
}

watch(
  () => props.blob,
  () => {
    release();
    load();
  },
);

onMounted(() => void nextTick(observe));
onBeforeUnmount(() => {
  observer?.disconnect();
  release();
});
</script>

<template>
  <span ref="host" class="books-shelf-cover">
    <img v-if="source" :src="source" :alt="alt" decoding="async" draggable="false" />
    <span v-else aria-hidden="true"><IconBook2 :size="42" stroke-width="1.25" /></span>
  </span>
</template>
