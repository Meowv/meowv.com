<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  IconAi,
  IconArrowsExchange,
  IconAsterisk,
  IconBinary,
  IconBook,
  IconBookmark,
  IconBorderCornerRounded,
  IconBraces,
  IconCalculator,
  IconCalendarMonth,
  IconCamera,
  IconCode,
  IconColorPicker,
  IconCrop,
  IconDeviceGamepad,
  IconFileCode,
  IconFileDiff,
  IconFileExport,
  IconFileSettings,
  IconFileTypePdf,
  IconFileZip,
  IconFiles,
  IconFlask,
  IconGitCompare,
  IconHash,
  IconIcons,
  IconInfoCircle,
  IconKeyboard,
  IconLanguage,
  IconLayoutGrid,
  IconLink,
  IconMap,
  IconMaximize,
  IconMoodSmile,
  IconPhoto,
  IconPhotoDown,
  IconPhotoEdit,
  IconQrcode,
  IconRotate,
  IconRubberStamp,
  IconScissors,
  IconSearch,
  IconSwitchHorizontal,
  IconTools,
  IconTrash,
  IconVector,
  IconVideo,
  IconVolume2,
  IconWorld,
  IconWriting,
  IconBrandAdobePhotoshop,
} from '@tabler/icons-vue';
import type { ToolIconSource } from '@/features/tools/tools';

const props = withDefaults(defineProps<{ icon: ToolIconSource; size?: number }>(), { size: 22 });

const icons: Record<string, Component> = {
  ai: IconAi,
  'arrows-exchange': IconArrowsExchange,
  asterisk: IconAsterisk,
  binary: IconBinary,
  book: IconBook,
  bookmark: IconBookmark,
  'border-corner': IconBorderCornerRounded,
  braces: IconBraces,
  calculator: IconCalculator,
  calendar: IconCalendarMonth,
  camera: IconCamera,
  code: IconCode,
  'color-picker': IconColorPicker,
  crop: IconCrop,
  'file-code': IconFileCode,
  'file-diff': IconFileDiff,
  'file-export': IconFileExport,
  'file-settings': IconFileSettings,
  'file-zip': IconFileZip,
  files: IconFiles,
  flask: IconFlask,
  gamepad: IconDeviceGamepad,
  'git-compare': IconGitCompare,
  hash: IconHash,
  icons: IconIcons,
  image: IconPhoto,
  info: IconInfoCircle,
  keyboard: IconKeyboard,
  language: IconLanguage,
  'layout-grid': IconLayoutGrid,
  link: IconLink,
  map: IconMap,
  maximize: IconMaximize,
  'mood-smile': IconMoodSmile,
  pdf: IconFileTypePdf,
  photo: IconPhoto,
  'photo-down': IconPhotoDown,
  'photo-edit': IconPhotoEdit,
  photoshop: IconBrandAdobePhotoshop,
  qrcode: IconQrcode,
  rotate: IconRotate,
  'rubber-stamp': IconRubberStamp,
  scissors: IconScissors,
  search: IconSearch,
  'switch-horizontal': IconSwitchHorizontal,
  tools: IconTools,
  trash: IconTrash,
  vector: IconVector,
  video: IconVideo,
  volume: IconVolume2,
  world: IconWorld,
  writing: IconWriting,
};

const imageFailed = ref(false);
const imageUrl = computed(() => (typeof props.icon === 'string' ? null : props.icon.url));
const iconComponent = computed(() =>
  typeof props.icon === 'string' ? (icons[props.icon] ?? IconTools) : IconTools,
);

watch(
  () => props.icon,
  () => {
    imageFailed.value = false;
  },
);
</script>

<template>
  <img
    v-if="imageUrl && !imageFailed"
    :src="imageUrl"
    :width="size"
    :height="size"
    alt=""
    loading="lazy"
    decoding="async"
    referrerpolicy="no-referrer"
    aria-hidden="true"
    @error="imageFailed = true"
  />
  <component :is="iconComponent" v-else :size="size" stroke-width="1.8" aria-hidden="true" />
</template>
