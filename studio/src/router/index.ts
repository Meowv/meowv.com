import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { routeLoading } from '@/core/shared/route-state';
import { STUDIO_DEFAULT_SEO, STUDIO_ROUTE_SEO, studioCanonicalUrl } from './seo';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
    meta: STUDIO_ROUTE_SEO.home,
  },
  {
    path: '/markdown',
    name: 'markdown',
    component: () => import('@/features/markdown/MarkdownStudioPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.markdown, feature: 'markdown' },
  },
  {
    path: '/mermaid',
    name: 'mermaid',
    component: () => import('@/features/mermaid/MermaidPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.mermaid, feature: 'mermaid' },
  },
  {
    path: '/office/:format(doc|xls|ppt|csv)?',
    name: 'office',
    component: () => import('@/features/office/OfficeStudioPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.office, feature: 'office' },
  },
  {
    path: '/books',
    name: 'books',
    component: () => import('@/features/books/BooksPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.books, feature: 'books' },
  },
  {
    path: '/draw',
    name: 'draw',
    component: () => import('@/features/draw/DrawPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.draw, feature: 'draw' },
  },
  {
    path: '/floorplan',
    name: 'floorplan',
    component: () => import('@/features/floorplan/FloorplanPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.floorplan, feature: 'floorplan' },
  },
  {
    path: '/mind',
    name: 'mind',
    component: () => import('@/features/mind/MindPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.mind, feature: 'mind' },
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/features/notes/NotesPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.notes, feature: 'notes' },
  },
  {
    path: '/wallpapers',
    name: 'wallpapers',
    component: () => import('@/features/wallpapers/WallpapersPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.wallpapers, feature: 'wallpapers' },
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('@/features/tools/pages/ToolsHome.vue'),
    meta: { ...STUDIO_ROUTE_SEO.tools, feature: 'tools' },
  },
  {
    path: '/tools/:toolId',
    name: 'tool-detail',
    component: () => import('@/features/tools/pages/ToolDetail.vue'),
    meta: { ...STUDIO_ROUTE_SEO.toolDetail, feature: 'tools' },
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/features/chat/ChatPage.vue'),
    meta: { ...STUDIO_ROUTE_SEO.chat, feature: 'chat' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: STUDIO_ROUTE_SEO.notFound,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: (to) => (to.path === '/tools' && to.hash ? false : { top: 0 }),
});

router.beforeEach((to, from) => {
  routeLoading.value = !from.name || to.path !== from.path;
});

router.afterEach((to) => {
  routeLoading.value = false;
  const title = typeof to.meta.title === 'string' ? to.meta.title : STUDIO_DEFAULT_SEO.title;
  const descriptionText =
    typeof to.meta.description === 'string' ? to.meta.description : STUDIO_DEFAULT_SEO.description;
  const canonical = studioCanonicalUrl(to.path);
  const noindex = to.meta.noindex === true;

  document.title = title;
  const setMeta = (selector: string, attributes: Record<string, string>, content: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
      element = document.createElement('meta');
      Object.entries(attributes).forEach(([key, value]) => element!.setAttribute(key, value));
      document.head.append(element);
    }
    element.content = content;
  };
  setMeta('meta[name="description"]', { name: 'description' }, descriptionText);
  setMeta('meta[name="robots"]', { name: 'robots' }, noindex ? 'noindex, follow' : 'index, follow');
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setMeta('meta[property="og:locale"]', { property: 'og:locale' }, 'zh_CN');
  setMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, 'Meowv Studio');
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, descriptionText);
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary');
  setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
  setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, descriptionText);

  let canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalElement) {
    canonicalElement = document.createElement('link');
    canonicalElement.rel = 'canonical';
    document.head.append(canonicalElement);
  }
  canonicalElement.href = canonical;
});

router.onError(() => {
  routeLoading.value = false;
});

export default router;
