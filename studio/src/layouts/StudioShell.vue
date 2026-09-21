<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  IconBrandOffice,
  IconApps,
  IconBook,
  IconChalkboard,
  IconChartDots3,
  IconMarkdown,
  IconMenu2,
  IconSitemap,
  IconNotes,
  IconWallpaper,
  IconX,
} from '@tabler/icons-vue';
import StudioDonationDialog from '@/components/StudioDonationDialog.vue';
import StudioFooter from '@/components/StudioFooter.vue';
import StudioLogo from '@/components/StudioLogo.vue';
import { useToolsBackground } from '@/features/tools/composables/useToolsBackground';
import { STORAGE_POLICY, storageAvailable } from '@/core/privacy/storage';
import {
  drawWelcomeBackgroundVisible,
  markdownBackgroundPreviewActive,
  markdownFullscreenActive,
  mermaidBackgroundPreviewActive,
  toolsBackgroundPreviewActive,
  workspaceActive,
  workspaceHeaderVisible,
} from '@/core/shared/route-state';

const ToolsBackground = defineAsyncComponent(
  () => import('@/features/tools/components/ToolsBackground.vue'),
);
const ToolsBackgroundSettings = defineAsyncComponent(
  () => import('@/features/tools/components/ToolsBackgroundSettings.vue'),
);

const route = useRoute();
const isHomePage = computed(() => route.name === 'home');
const isMarkdownPage = computed(() => route.meta.feature === 'markdown');
const isMermaidPage = computed(() => route.meta.feature === 'mermaid');
const isDrawPage = computed(() => route.meta.feature === 'draw');
const isMindPage = computed(() => route.meta.feature === 'mind');
const isNotesPage = computed(() => route.meta.feature === 'notes');
const isToolsPage = computed(() => route.meta.feature === 'tools');
const isToolsHomePage = computed(() => route.name === 'tools');
const isToolDetailPage = computed(() => route.name === 'tool-detail');
const isOfficePage = computed(() => route.meta.feature === 'office');
const isBooksPage = computed(() => route.meta.feature === 'books');
const isWallpapersPage = computed(() => route.meta.feature === 'wallpapers');
const {
  enabled: toolsBackgroundEnabled,
  pendingSource: toolsBackgroundPendingSource,
  surfaceOpacity: toolsBackgroundSurfaceOpacity,
  applyToOtherPages: toolsBackgroundApplyToOtherPages,
} = useToolsBackground();
const homeBackgroundEnabled = computed(
  () => isHomePage.value && toolsBackgroundEnabled.value && toolsBackgroundApplyToOtherPages.value,
);
const officeBackgroundEnabled = computed(
  () =>
    isOfficePage.value &&
    !workspaceActive.value &&
    toolsBackgroundEnabled.value &&
    toolsBackgroundApplyToOtherPages.value,
);
const markdownBackgroundEnabled = computed(
  () =>
    isMarkdownPage.value &&
    !markdownFullscreenActive.value &&
    toolsBackgroundEnabled.value &&
    toolsBackgroundApplyToOtherPages.value,
);
const mermaidBackgroundEnabled = computed(
  () =>
    isMermaidPage.value && toolsBackgroundEnabled.value && toolsBackgroundApplyToOtherPages.value,
);
watch(
  mermaidBackgroundEnabled,
  (active) => {
    mermaidBackgroundPreviewActive.value = active;
  },
  { immediate: true },
);
watch(
  markdownBackgroundEnabled,
  (active) => {
    markdownBackgroundPreviewActive.value = active;
  },
  { immediate: true },
);
const toolsBackgroundPreviewEnabled = computed(
  () => isToolsPage.value && toolsBackgroundEnabled.value,
);
watch(
  toolsBackgroundPreviewEnabled,
  (active) => {
    toolsBackgroundPreviewActive.value = active;
  },
  { immediate: true },
);
const drawBackgroundEnabled = computed(
  () =>
    isDrawPage.value &&
    drawWelcomeBackgroundVisible.value &&
    toolsBackgroundEnabled.value &&
    toolsBackgroundApplyToOtherPages.value,
);
const mindBackgroundEnabled = computed(
  () => isMindPage.value && toolsBackgroundEnabled.value && toolsBackgroundApplyToOtherPages.value,
);
const notesBackgroundEnabled = computed(
  () => isNotesPage.value && toolsBackgroundEnabled.value && toolsBackgroundApplyToOtherPages.value,
);
const wallpapersBackgroundEnabled = computed(
  () =>
    isWallpapersPage.value &&
    toolsBackgroundEnabled.value &&
    toolsBackgroundApplyToOtherPages.value,
);
const supportsToolsBackground = computed(
  () =>
    isToolsPage.value ||
    Boolean(toolsBackgroundPendingSource.value) ||
    homeBackgroundEnabled.value ||
    officeBackgroundEnabled.value ||
    markdownBackgroundEnabled.value ||
    mermaidBackgroundEnabled.value ||
    drawBackgroundEnabled.value ||
    mindBackgroundEnabled.value ||
    notesBackgroundEnabled.value ||
    wallpapersBackgroundEnabled.value,
);
const toolsBackgroundStyle = computed<Record<string, string>>(() => {
  const surfaceOpacity = toolsBackgroundSurfaceOpacity.value;
  const textHaloOpacity = Math.max(0.12, 0.82 * (1 - surfaceOpacity));
  return {
    '--tools-background-surface-opacity': `${Math.round(surfaceOpacity * 100)}%`,
    '--home-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--office-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--markdown-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--mermaid-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--draw-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--mind-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--notes-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--wallpapers-background-surface-opacity': `${Math.round(Math.max(0.18, surfaceOpacity) * 100)}%`,
    '--tools-background-text-halo-opacity': textHaloOpacity.toFixed(2),
  };
});
const isImmersive = computed(
  () =>
    route.meta.feature === 'markdown' ||
    isMermaidPage.value ||
    isBooksPage.value ||
    isDrawPage.value ||
    isMindPage.value ||
    isNotesPage.value ||
    isToolsHomePage.value ||
    workspaceActive.value,
);
const markdownHeaderVisible = ref(true);
const mermaidHeaderVisible = ref(true);
const booksHeaderVisible = ref(true);
const toolsHeaderVisible = ref(true);
const wallpapersHeaderVisible = ref(true);
const wallpapersHeaderAutoHidden = ref(false);
const wallpapersHeaderShown = computed(
  () => wallpapersHeaderVisible.value && !wallpapersHeaderAutoHidden.value,
);
function isDesktopViewport(): boolean {
  return window.innerWidth > 760;
}
const MARKDOWN_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('markdown')}:header-collapsed`;
const BOOKS_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.namespace('books')}:header-collapsed`;
const TOOLS_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.preferences}:tools-header-collapsed`;
const MERMAID_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.preferences}:mermaid-header-collapsed`;
const WALLPAPERS_HEADER_PREFERENCE_KEY = `${STORAGE_POLICY.preferences}:wallpapers-header-collapsed`;
const showHeader = computed(() =>
  isDrawPage.value || isMindPage.value || isNotesPage.value || isMermaidPage.value
    ? false
    : isMarkdownPage.value
      ? markdownHeaderVisible.value
      : isBooksPage.value
        ? booksHeaderVisible.value
        : isToolsPage.value
          ? toolsHeaderVisible.value
          : isWallpapersPage.value
            ? wallpapersHeaderShown.value
            : !workspaceActive.value || workspaceHeaderVisible.value,
);
const showFooter = computed(
  () => ['home', 'office', 'not-found'].includes(String(route.name)) && !workspaceActive.value,
);
const donationDialogOpen = ref(false);
const DONATION_HASHES = ['support', 'sponsor', 'donate'];
const mobileNavigationOpen = ref(false);
const headerElement = ref<HTMLElement | null>(null);

function isDonationHash(hash: string): boolean {
  return DONATION_HASHES.includes(hash.replace(/^#/, '').toLowerCase());
}

function clearLocationHash(): void {
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

// 任意页面带上 #support / #sponsor / #donate 都会直接打开赞助支持弹窗。
watch(
  () => route.hash,
  (hash) => {
    if (isDonationHash(hash)) donationDialogOpen.value = true;
  },
  { immediate: true },
);

// 手动改写地址栏 hash 时路由不一定更新，这里补一次。
function handleWindowHashChange(): void {
  if (isDonationHash(window.location.hash)) donationDialogOpen.value = true;
}

// 关闭后清掉 hash，避免刷新或前进/后退时重复弹出。
watch(donationDialogOpen, (open) => {
  if (open || !isDonationHash(window.location.hash)) return;
  clearLocationHash();
});

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

watch(
  isMermaidPage,
  (active) => {
    if (!active) {
      mermaidHeaderVisible.value = true;
      return;
    }
    if (!storageAvailable()) return;
    try {
      mermaidHeaderVisible.value = localStorage.getItem(MERMAID_HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时保留默认展开状态。
    }
  },
  { immediate: true },
);

watch(
  isBooksPage,
  (active) => {
    if (!active) {
      booksHeaderVisible.value = true;
      return;
    }
    if (!storageAvailable()) return;
    try {
      booksHeaderVisible.value = localStorage.getItem(BOOKS_HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时保留默认展开状态。
    }
  },
  { immediate: true },
);

watch(
  isToolsPage,
  (active) => {
    if (!active) {
      toolsHeaderVisible.value = true;
      return;
    }
    if (!storageAvailable()) return;
    try {
      toolsHeaderVisible.value = localStorage.getItem(TOOLS_HEADER_PREFERENCE_KEY) !== 'true';
    } catch {
      // 本地偏好不可用时保留默认展开状态。
    }
  },
  { immediate: true },
);

watch(
  isWallpapersPage,
  (active) => {
    if (!active) {
      wallpapersHeaderVisible.value = true;
      wallpapersHeaderAutoHidden.value = false;
      return;
    }
    if (storageAvailable()) {
      try {
        wallpapersHeaderVisible.value =
          localStorage.getItem(WALLPAPERS_HEADER_PREFERENCE_KEY) !== 'true';
      } catch {
        // 本地偏好不可用时保留默认展开状态。
      }
    }
    wallpapersHeaderAutoHidden.value =
      isDesktopViewport() && wallpapersHeaderVisible.value && window.scrollY > 8;
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

function toggleMermaidHeader(): void {
  mermaidHeaderVisible.value = !mermaidHeaderVisible.value;
  if (!storageAvailable()) return;
  try {
    if (mermaidHeaderVisible.value) localStorage.removeItem(MERMAID_HEADER_PREFERENCE_KEY);
    else localStorage.setItem(MERMAID_HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用不影响当前页面切换。
  }
}

function toggleBooksHeader(): void {
  booksHeaderVisible.value = !booksHeaderVisible.value;
  if (!storageAvailable()) return;
  try {
    if (booksHeaderVisible.value) localStorage.removeItem(BOOKS_HEADER_PREFERENCE_KEY);
    else localStorage.setItem(BOOKS_HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用不影响当前页面切换。
  }
}

function toggleToolsHeader(): void {
  toolsHeaderVisible.value = !toolsHeaderVisible.value;
  if (!storageAvailable()) return;
  try {
    if (toolsHeaderVisible.value) localStorage.removeItem(TOOLS_HEADER_PREFERENCE_KEY);
    else localStorage.setItem(TOOLS_HEADER_PREFERENCE_KEY, 'true');
  } catch {
    // 本地偏好不可用不影响当前页面切换。
  }
}

function toggleWallpapersHeader(): void {
  if (wallpapersHeaderAutoHidden.value) {
    wallpapersHeaderAutoHidden.value = false;
    return;
  }
  wallpapersHeaderVisible.value = !wallpapersHeaderVisible.value;
  if (!storageAvailable()) return;
  try {
    if (wallpapersHeaderVisible.value) localStorage.removeItem(WALLPAPERS_HEADER_PREFERENCE_KEY);
    else localStorage.setItem(WALLPAPERS_HEADER_PREFERENCE_KEY, 'true');
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

function handleDocumentContextMenu(event: MouseEvent): void {
  event.preventDefault();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMobileNavigation();
}

function handleWindowScroll(): void {
  if (!isDesktopViewport() || !isWallpapersPage.value || !wallpapersHeaderVisible.value) {
    wallpapersHeaderAutoHidden.value = false;
    return;
  }
  wallpapersHeaderAutoHidden.value = window.scrollY > 8;
}

function handleWindowResize(): void {
  handleWindowScroll();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('contextmenu', handleDocumentContextMenu);
  document.addEventListener('keydown', handleDocumentKeydown);
  window.addEventListener('scroll', handleWindowScroll, { passive: true });
  window.addEventListener('resize', handleWindowResize, { passive: true });
  window.addEventListener('hashchange', handleWindowHashChange);
  handleWindowScroll();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('contextmenu', handleDocumentContextMenu);
  document.removeEventListener('keydown', handleDocumentKeydown);
  window.removeEventListener('scroll', handleWindowScroll);
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('hashchange', handleWindowHashChange);
});

const primaryRoutes = [
  { label: 'Markdown', to: '/markdown', icon: IconMarkdown, className: 'nav-markdown' },
  { label: 'Office', to: '/office', icon: IconBrandOffice, className: 'nav-office' },
  { label: 'Books', to: '/books', icon: IconBook, className: 'nav-books' },
  { label: 'Whiteboard', to: '/draw', icon: IconChalkboard, className: 'nav-draw' },
  { label: 'Mermaid', to: '/mermaid', icon: IconChartDots3, className: 'nav-mermaid' },
  { label: 'Mind', to: '/mind', icon: IconSitemap, className: 'nav-mind' },
  { label: 'Notes', to: '/notes', icon: IconNotes, className: 'nav-notes' },
  { label: 'Wallpapers', to: '/wallpapers', icon: IconWallpaper, className: 'nav-wallpapers' },
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
      'studio-shell--mermaid': isMermaidPage,
      'studio-shell--mermaid-header': isMermaidPage && mermaidHeaderVisible,
      'studio-shell--draw': isDrawPage,
      'studio-shell--mind': isMindPage,
      'studio-shell--notes': isNotesPage,
      'studio-shell--tools': isToolsPage,
      'studio-shell--tools-background': isToolsPage && toolsBackgroundEnabled,
      'studio-shell--home-background': homeBackgroundEnabled,
      'studio-shell--office-background': officeBackgroundEnabled,
      'studio-shell--markdown-background': markdownBackgroundEnabled,
      'studio-shell--markdown-background-preview': markdownBackgroundEnabled,
      'studio-shell--mermaid-background': mermaidBackgroundEnabled,
      'studio-shell--draw-background': drawBackgroundEnabled,
      'studio-shell--mind-background': mindBackgroundEnabled,
      'studio-shell--notes-background': notesBackgroundEnabled,
      'studio-shell--wallpapers-background': wallpapersBackgroundEnabled,
      'studio-shell--tools-header': isToolsPage && toolsHeaderVisible,
      'studio-shell--tool-detail': isToolDetailPage,
      'studio-shell--office': isOfficePage,
      'studio-shell--books': isBooksPage,
      'studio-shell--books-header': isBooksPage && booksHeaderVisible,
      'studio-shell--wallpapers': isWallpapersPage,
      'studio-shell--wallpapers-header': isWallpapersPage && wallpapersHeaderShown,
      'studio-shell--with-footer': showFooter,
    }"
    :style="supportsToolsBackground ? toolsBackgroundStyle : undefined"
  >
    <header
      v-show="showHeader"
      ref="headerElement"
      :key="
        isMarkdownPage
          ? 'markdown-header'
          : isMermaidPage
            ? 'mermaid-header'
            : isBooksPage
              ? 'books-header'
              : isWallpapersPage
                ? 'wallpapers-header'
                : 'default-header'
      "
      class="studio-header"
    >
      <div class="studio-header__start">
        <StudioLogo />
        <strong v-if="isBooksPage" class="studio-header__feature-name">仿真书</strong>
        <strong v-else-if="isToolsPage" class="studio-header__feature-name">工具</strong>
        <strong v-else-if="isMermaidPage" class="studio-header__feature-name">Mermaid</strong>
        <strong v-else-if="isWallpapersPage" class="studio-header__feature-name">壁纸</strong>
      </div>
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
    <studio-header-toggle
      v-if="isMermaidPage"
      :visible="mermaidHeaderVisible"
      @click="toggleMermaidHeader"
    />
    <studio-header-toggle
      v-if="isBooksPage"
      :visible="booksHeaderVisible"
      @click="toggleBooksHeader"
    />
    <studio-header-toggle
      v-if="isToolsPage"
      :visible="toolsHeaderVisible"
      @click="toggleToolsHeader"
    />
    <studio-header-toggle
      v-if="isWallpapersPage"
      :visible="wallpapersHeaderShown"
      @click="toggleWallpapersHeader"
    />

    <template v-if="supportsToolsBackground">
      <ToolsBackground />
      <ToolsBackgroundSettings v-if="isToolsPage" />
    </template>

    <main class="studio-main">
      <slot />
    </main>
    <StudioFooter v-if="showFooter" @support="donationDialogOpen = true" />
    <StudioDonationDialog v-model="donationDialogOpen" />
  </div>
</template>
