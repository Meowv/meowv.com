<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IconBrandOffice,
  IconApps,
  IconChalkboard,
  IconMarkdown,
  IconMenu2,
  IconSitemap,
  IconNotes,
  IconX,
} from '@tabler/icons-vue';
import StudioDonationDialog from '@/components/StudioDonationDialog.vue';
import StudioFooter from '@/components/StudioFooter.vue';
import StudioLogo from '@/components/StudioLogo.vue';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import { workspaceActive, workspaceHeaderVisible } from '@/core/shared/route-state';

const route = useRoute();
const isMarkdownPage = computed(() => route.meta.feature === 'markdown');
const isDrawPage = computed(() => route.meta.feature === 'draw');
const isMindPage = computed(() => route.meta.feature === 'mind');
const isNotesPage = computed(() => route.meta.feature === 'notes');
const isToolsPage = computed(() => route.meta.feature === 'tools');
const isToolsHomePage = computed(() => route.name === 'tools');
const isToolDetailPage = computed(() => route.name === 'tool-detail');
const isOfficePage = computed(() => route.meta.feature === 'office');
const isImmersive = computed(
  () =>
    route.meta.feature === 'markdown' ||
    isDrawPage.value ||
    isMindPage.value ||
    isNotesPage.value ||
    isToolsHomePage.value ||
    workspaceActive.value,
);
const markdownHeaderVisible = ref(true);
const MARKDOWN_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('markdown')}:header-collapsed`;
const showHeader = computed(() =>
  isDrawPage.value || isMindPage.value || isNotesPage.value
    ? false
    : isMarkdownPage.value
      ? markdownHeaderVisible.value
      : !workspaceActive.value || workspaceHeaderVisible.value,
);
const showFooter = computed(
  () =>
    ['home', 'image', 'ocr', 'pdf', 'office', 'not-found'].includes(String(route.name)) &&
    !workspaceActive.value,
);
const donationDialogOpen = ref(false);
const mobileNavigationOpen = ref(false);
const headerElement = ref<HTMLElement | null>(null);

watch(
  isMarkdownPage,
  (active) => {
    if (!active) {
      markdownHeaderVisible.value = true;
      return;
    }
    if (!storageAvailable()) return;
    try {
      markdownHeaderVisible.value = localStorage.getItem(MARKDOWN_HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时保留默认展开状态。
    }
  },
  { immediate: true },
);

function toggleMarkdownHeader(): void {
  markdownHeaderVisible.value = !markdownHeaderVisible.value;
  if (!storageAvailable()) return;
  try {
    if (markdownHeaderVisible.value) localStorage.removeItem(MARKDOWN_HEADER_PREFERENCE_KEY);
    else localStorage.setItem(MARKDOWN_HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用不影响当前页面切换。
  }
}

function closeMobileNavigation(): void {
  mobileNavigationOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (event.target instanceof Node && !headerElement.value?.contains(event.target)) {
    closeMobileNavigation();
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMobileNavigation();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
});

const primaryRoutes = [
  { label: 'Markdown', to: '/markdown', icon: IconMarkdown, className: 'nav-markdown' },
  { label: 'Office', to: '/office', icon: IconBrandOffice, className: 'nav-office' },
  { label: 'Whiteboard', to: '/draw', icon: IconChalkboard, className: 'nav-draw' },
  { label: 'Mind', to: '/mind', icon: IconSitemap, className: 'nav-mind' },
  { label: 'Notes', to: '/notes', icon: IconNotes, className: 'nav-notes' },
  { label: 'Tools', to: '/tools', icon: IconApps, className: 'nav-tools' },
];

function isRouteActive(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <div
    class="studio-shell"
    :class="{
      'studio-shell--immersive': isImmersive,
      'studio-shell--markdown': isMarkdownPage,
      'studio-shell--draw': isDrawPage,
      'studio-shell--mind': isMindPage,
      'studio-shell--notes': isNotesPage,
      'studio-shell--tools': isToolsPage,
      'studio-shell--tool-detail': isToolDetailPage,
      'studio-shell--office': isOfficePage,
      'studio-shell--with-footer': showFooter,
    }"
  >
    <header
      v-show="showHeader"
      ref="headerElement"
      :key="isMarkdownPage ? 'markdown-header' : 'default-header'"
      class="studio-header"
    >
      <StudioLogo />
      <button
        class="studio-nav-toggle"
        type="button"
        :aria-expanded="mobileNavigationOpen"
        aria-controls="studio-primary-navigation"
        :aria-label="mobileNavigationOpen ? '关闭菜单' : '打开菜单'"
        :title="mobileNavigationOpen ? '关闭菜单' : '打开菜单'"
        @click="mobileNavigationOpen = !mobileNavigationOpen"
      >
        <IconX v-if="mobileNavigationOpen" :size="22" aria-hidden="true" />
        <IconMenu2 v-else :size="22" aria-hidden="true" />
      </button>
      <nav
        id="studio-primary-navigation"
        class="studio-nav"
        :class="{ 'studio-nav--open': mobileNavigationOpen }"
        aria-label="主要工具"
      >
        <RouterLink
          v-for="navRoute in primaryRoutes"
          :key="navRoute.to"
          :to="navRoute.to"
          :class="[navRoute.className, { 'is-active': isRouteActive(navRoute.to) }]"
          :aria-label="navRoute.label"
          @click="closeMobileNavigation"
        >
          <component :is="navRoute.icon" :size="21" stroke-width="1.8" aria-hidden="true" />
          <span>{{ navRoute.label }}</span>
        </RouterLink>
      </nav>
    </header>
    <studio-header-toggle
      v-if="isMarkdownPage"
      :visible="markdownHeaderVisible"
      @click="toggleMarkdownHeader"
    />

    <main class="studio-main">
      <slot />
    </main>
    <StudioFooter v-if="showFooter" @support="donationDialogOpen = true" />
    <StudioDonationDialog v-model="donationDialogOpen" />
  </div>
</template>
