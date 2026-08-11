import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { routeLoading } from '@/core/shared/route-state';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
    meta: {
      title: 'Meowv Studio · 本地文件工作台',
      description:
        '无需上传文件的本地文件工作台：在浏览器中处理图片、PDF、Markdown 与 Office 文档，内容始终留在你的设备上。',
    },
  },
  {
    path: '/markdown',
    name: 'markdown',
    component: () => import('@/features/markdown/MarkdownStudioPage.vue'),
    meta: {
      title: 'Markdown · Meowv Studio',
      description: '在浏览器本地编辑、预览、搜索并导出 Markdown 文档，内容无需上传。',
      feature: 'markdown',
    },
  },
  {
    path: '/office/:format(doc|xls|ppt|csv)?',
    name: 'office',
    component: () => import('@/features/office/OfficeStudioPage.vue'),
    meta: {
      title: 'Office · Meowv Studio',
      description: '在浏览器本地打开、编辑并保存 DOCX、XLSX、PPTX 与 CSV 文件，内容无需上传。',
      feature: 'office',
    },
  },
  {
    path: '/draw',
    name: 'draw',
    component: () => import('@/features/draw/DrawPage.vue'),
    meta: {
      title: '白板 · Meowv Studio',
      description: '在浏览器本地绘制草图、流程图和白板内容，画板无需上传。',
      feature: 'draw',
    },
  },
  {
    path: '/mind',
    name: 'mind',
    component: () => import('@/features/mind/MindPage.vue'),
    meta: {
      title: '思维导图 · Meowv Studio',
      description: '在浏览器本地创建、整理、保存和导出思维导图与 Markdown 脑图，内容无需上传。',
      feature: 'mind',
    },
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/features/notes/NotesPage.vue'),
    meta: {
      title: '便签 · Meowv Studio',
      description: '在浏览器本地自由放置、编辑彩色便签，内容自动保存且无需上传。',
      feature: 'notes',
    },
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('@/features/tools/pages/ToolsHome.vue'),
    meta: {
      title: 'Tools 工具箱 · Meowv Studio',
      description: '纯前端、本地处理的在线工具箱，覆盖开发、数据、编码、文本与设计等常用场景。',
      feature: 'tools',
    },
  },
  {
    path: '/tools/:toolId',
    name: 'tool-detail',
    component: () => import('@/features/tools/pages/ToolDetail.vue'),
    meta: {
      title: '在线工具 · Meowv Studio',
      description: '在浏览器本地使用 Studio Tools，处理内容无需上传。',
      feature: 'tools',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      title: '页面未找到 · Meowv Studio',
      description: '请求的页面不存在。',
    },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: (to) => (to.path === '/tools' && to.hash ? false : { top: 0 }),
});

router.beforeEach(() => {
  routeLoading.value = true;
});

router.afterEach((to) => {
  routeLoading.value = false;
  document.title = typeof to.meta.title === 'string' ? to.meta.title : 'Meowv Studio';
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description && typeof to.meta.description === 'string') {
    description.content = to.meta.description;
  }
});

router.onError(() => {
  routeLoading.value = false;
});

export default router;
