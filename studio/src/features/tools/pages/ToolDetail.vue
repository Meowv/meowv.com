<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getToolById } from '@/features/tools/config/tools';

const route = useRoute();
const tool = computed(() => getToolById(String(route.params.toolId)));
</script>

<template>
  <h1>{{ tool?.name ?? '标题占位' }}</h1>
  <p>{{ tool?.description ?? '描述占位' }}</p>
</template>
