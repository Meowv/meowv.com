<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import {
  IconArrowsExchange,
  IconAsterisk,
  IconBinary,
  IconBook,
  IconBorderCornerRounded,
  IconBraces,
  IconCalculator,
  IconCalendarTime,
  IconCamera,
  IconClock,
  IconCode,
  IconColorPicker,
  IconCrop,
  IconDeviceGamepad,
  IconFileCode,
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
  IconPalette,
  IconPhoto,
  IconPhotoDown,
  IconPhotoEdit,
  IconQrcode,
  IconRotate,
  IconRubberStamp,
  IconScissors,
  IconSparkles,
  IconTextRecognition,
  IconTools,
  IconTrash,
  IconTypography,
  IconVector,
  IconVideo,
  IconWorld,
  IconWriting,
  IconBrandAdobePhotoshop,
} from '@tabler/icons-vue';
import type { ToolIconSource } from '@/features/tools/tools';

const props = withDefaults(defineProps<{ icon: ToolIconSource; size?: number }>(), { size: 22 });

const icons: Record<string, Component> = {
  'arrows-exchange': IconArrowsExchange,
  asterisk: IconAsterisk,
  binary: IconBinary,
  book: IconBook,
  'border-corner': IconBorderCornerRounded,
  braces: IconBraces,
  calculator: IconCalculator,
  calendar: IconCalendarTime,
  camera: IconCamera,
  clock: IconClock,
  code: IconCode,
  'color-picker': IconColorPicker,
  converter: IconArrowsExchange,
  crop: IconCrop,
  'file-code': IconFileCode,
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
  palette: IconPalette,
  pdf: IconFileTypePdf,
  photo: IconPhoto,
  'photo-down': IconPhotoDown,
  'photo-edit': IconPhotoEdit,
  photoshop: IconBrandAdobePhotoshop,
  qrcode: IconQrcode,
  rotate: IconRotate,
  'rubber-stamp': IconRubberStamp,
  scissors: IconScissors,
  sparkles: IconSparkles,
  text: IconTypography,
  'text-recognition': IconTextRecognition,
  tools: IconTools,
  trash: IconTrash,
  vector: IconVector,
  video: IconVideo,
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
