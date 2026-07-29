<script setup lang="ts">
import { Heart, Menu, X } from "@lucide/vue";
import AppLogo from "~/components/layout/AppLogo.vue";
import ThemeSwitch from "~/components/layout/ThemeSwitch.vue";

const route = useRoute();
const mobileMenuOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false;
  }
);
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <AppLogo />

      <nav class="site-header__nav" aria-label="主要导航">
        <NuxtLink to="/#tools">全部工具</NuxtLink>
        <NuxtLink to="/privacy">隐私说明</NuxtLink>
        <NuxtLink to="/help">使用帮助</NuxtLink>
        <NuxtLink class="site-header__donate" to="/donate">
          <Heart :size="16" />
          捐赠支持
        </NuxtLink>
      </nav>

      <div class="site-header__actions">
        <ThemeSwitch />
        <button
          class="site-header__menu-button"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-navigation"
          :aria-label="mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <X v-if="mobileMenuOpen" :size="21" />
          <Menu v-else :size="21" />
        </button>
      </div>
    </div>

    <nav
      v-if="mobileMenuOpen"
      id="mobile-navigation"
      class="site-header__mobile-nav"
      aria-label="移动端导航"
    >
      <NuxtLink to="/#tools">全部工具</NuxtLink>
      <NuxtLink to="/privacy">隐私说明</NuxtLink>
      <NuxtLink to="/help">使用帮助</NuxtLink>
      <NuxtLink to="/donate">捐赠支持</NuxtLink>
    </nav>
  </header>
</template>
