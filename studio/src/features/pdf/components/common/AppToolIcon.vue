<script setup lang="ts">
import type { Component } from 'vue';
import {
  FileCog,
  FileOutput,
  Files,
  Hash,
  ImageDown,
  LayoutGrid,
  RotateCw,
  Scissors,
  Stamp,
  Trash2,
} from '@/features/pdf/icons';
import type { PdfToolIcon } from '@/features/pdf/config/tools';

withDefaults(
  defineProps<{
    name: PdfToolIcon;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 24,
    strokeWidth: 2,
  },
);

const iconMap: Record<PdfToolIcon, Component> = {
  files: Files,
  scissors: Scissors,
  'layout-grid': LayoutGrid,
  trash: Trash2,
  'file-output': FileOutput,
  rotate: RotateCw,
  'image-down': ImageDown,
  stamp: Stamp,
  hash: Hash,
  'file-cog': FileCog,
};
</script>

<template>
  <component :is="iconMap[name]" :size="size" :stroke-width="strokeWidth" aria-hidden="true" />
</template>
