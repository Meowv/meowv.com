<script setup lang="ts">
import { RouterView } from "vue-router";

import AppFooter from "@/components/layout/AppFooter.vue";
import AppHeader from "@/components/layout/AppHeader.vue";
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <AppHeader />
  <RouterView />
  <AppFooter />
</template>
