<script setup lang="ts">
import { ChevronDown, Menu, X } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import AppLogo from "@/components/layout/AppLogo.vue";
import ThemeSwitch from "@/components/layout/ThemeSwitch.vue";
import { tools } from "@/config/tools";

const route = useRoute();
const mobileMenuOpen = ref(false);
const mobileMenuButton = ref<HTMLButtonElement | null>(null);
const toolsMenuOpen = ref(false);
const toolsMenuContainer = ref<HTMLElement | null>(null);
const toolsMenuButton = ref<HTMLButtonElement | null>(null);

const navigation = [
  { label: "隐私说明", to: "/privacy" },
  { label: "捐赠支持", to: "/#donate" },
] as const;
const enabledTools = tools.filter((tool) => tool.enabled && tool.route);

function closeMobileMenu(): void {
  mobileMenuOpen.value = false;
}

function closeToolsMenu(): void {
  toolsMenuOpen.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") {
    return;
  }

  if (toolsMenuOpen.value) {
    closeToolsMenu();
    void nextTick(() => {
      toolsMenuButton.value?.focus();
    });
  }

  if (mobileMenuOpen.value) {
    closeMobileMenu();
    void nextTick(() => {
      mobileMenuButton.value?.focus();
    });
  }
}

function handlePointerDown(event: PointerEvent): void {
  const target = event.target;
  if (
    toolsMenuOpen.value &&
    target instanceof Node &&
    !toolsMenuContainer.value?.contains(target)
  ) {
    closeToolsMenu();
  }
}

watch(
  () => route.fullPath,
  () => {
    closeMobileMenu();
    closeToolsMenu();
  },
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", handlePointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pointerdown", handlePointerDown);
});
</script>

<template>
  <header
    class="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90"
  >
    <div class="mx-auto flex h-[72px] max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
      <AppLogo class="mr-auto" />

      <nav class="hidden items-center gap-1 lg:flex" aria-label="主要导航">
        <div ref="toolsMenuContainer" class="relative">
          <button
            ref="toolsMenuButton"
            class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 outline-none transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-violet-900"
            type="button"
            aria-controls="desktop-tools-menu"
            :aria-expanded="toolsMenuOpen"
            aria-haspopup="menu"
            @click="toolsMenuOpen = !toolsMenuOpen"
          >
            全部工具
            <ChevronDown
              :size="16"
              aria-hidden="true"
              :class="{ 'rotate-180': toolsMenuOpen }"
              class="transition-transform"
            />
          </button>

          <div
            v-if="toolsMenuOpen"
            id="desktop-tools-menu"
            class="absolute right-0 top-[calc(100%+12px)] grid w-[720px] grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="menu"
            aria-label="图片工具"
          >
            <RouterLink
              v-for="tool in enabledTools"
              :key="tool.slug"
              class="group flex min-h-[84px] gap-3 rounded-lg p-3 outline-none transition hover:bg-violet-50 focus-visible:ring-4 focus-visible:ring-violet-200 dark:hover:bg-violet-950 dark:focus-visible:ring-violet-900"
              :to="tool.route!"
              role="menuitem"
              @click="closeToolsMenu"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 transition group-hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:group-hover:bg-violet-900">
                <component :is="tool.icon" :size="18" aria-hidden="true" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-bold text-slate-800 dark:text-slate-100">
                  {{ tool.name }}
                </span>
                <span class="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {{ tool.description }}
                </span>
              </span>
            </RouterLink>
          </div>
        </div>

        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 outline-none transition hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-violet-900"
          :to="item.to"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="flex items-center gap-2">
        <ThemeSwitch />
        <button
          ref="mobileMenuButton"
          class="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 outline-none transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-700 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
          type="button"
          :aria-expanded="mobileMenuOpen"
          aria-controls="mobile-navigation"
          aria-haspopup="true"
          :aria-label="mobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <X v-if="mobileMenuOpen" :size="21" aria-hidden="true" />
          <Menu v-else :size="21" aria-hidden="true" />
        </button>
      </div>
    </div>

    <nav
      v-if="mobileMenuOpen"
      id="mobile-navigation"
      class="border-t border-slate-200 bg-white px-4 py-3 shadow-lg lg:hidden dark:border-slate-800 dark:bg-slate-950"
      aria-label="移动端导航"
    >
      <div class="mx-auto grid max-w-7xl gap-1">
        <RouterLink
          class="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-slate-200 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
          to="/#tools"
          @click="closeMobileMenu"
        >
          工具总览
        </RouterLink>
        <RouterLink
          v-for="tool in enabledTools"
          :key="tool.slug"
          class="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-slate-200 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
          :to="tool.route!"
          @click="closeMobileMenu"
        >
          <component :is="tool.icon" :size="17" aria-hidden="true" />
          {{ tool.name }}
        </RouterLink>
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          class="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:text-slate-200 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
          :to="item.to"
          @click="closeMobileMenu"
        >
          {{ item.label }}
        </RouterLink>
      </div>
    </nav>
  </header>
</template>
