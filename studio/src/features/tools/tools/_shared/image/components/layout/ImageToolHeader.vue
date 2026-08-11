<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string;
  description: string;
  icon: Component;
}>();
</script>

<template>
  <section class="image-tool-header">
    <div class="page-container">
      <header class="image-tool-header__inner">
        <span class="image-tool-header__icon" aria-hidden="true">
          <component :is="icon" :size="27" stroke-width="1.8" />
        </span>
        <div>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
      </header>
    </div>
  </section>
</template>
