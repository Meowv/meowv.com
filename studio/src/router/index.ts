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
        'Meowv Studio 是无需上传文件的浏览器本地工作台，支持图片、PDF、Markdown、Office、白板、思维导图、便签等工具，内容始终留在你的设备上。',
    },
  },
  {
    path: '/markdown',
    name: 'markdown',
    component: () => import('@/features/markdown/MarkdownStudioPage.vue'),
    meta: {
      title: 'Markdown · Meowv Studio',
      description:
        '在浏览器本地打开、编辑和预览 Markdown，支持文件夹工作空间、全文搜索及 HTML、PDF、Word 等格式导出，文档无需上传。',
      feature: 'markdown',
    },
  },
  {
    path: '/office/:format(doc|xls|ppt|csv)?',
    name: 'office',
    component: () => import('@/features/office/OfficeStudioPage.vue'),
    meta: {
      title: 'Office · Meowv Studio',
      description:
        '在浏览器本地打开、创建、编辑并保存 Word、Excel、PowerPoint 和 CSV 文件，无需上传文档，兼顾常用 Office 编辑体验与数据隐私。',
      feature: 'office',
    },
  },
  {
    path: '/draw',
    name: 'draw',
    component: () => import('@/features/draw/DrawPage.vue'),
    meta: {
      title: '白板 · Meowv Studio',
      description:
        '基于 Excalidraw 的浏览器本地白板，可绘制草图、流程图和架构图，支持自动保存及 PNG、SVG、Excalidraw 文件导出。',
      feature: 'draw',
    },
  },
  {
    path: '/mind',
    name: 'mind',
    component: () => import('@/features/mind/MindPage.vue'),
    meta: {
      title: '思维导图 · Meowv Studio',
      description:
        '在浏览器本地创建和整理思维导图与 Markdown 脑图，支持自动保存，并可导出 Markdown、PNG、SVG、JSON 等格式。',
      feature: 'mind',
    },
  },
  {
    path: '/notes',
    name: 'notes',
    component: () => import('@/features/notes/NotesPage.vue'),
    meta: {
      title: '便签 · Meowv Studio',
      description:
        '在浏览器本地创建和整理彩色便签，支持自由布局、置顶、折叠与自动保存，灵感和待办内容无需上传。',
      feature: 'notes',
    },
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('@/features/tools/pages/ToolsHome.vue'),
    meta: {
      title: '工具 · Meowv Studio',
      description:
        '汇集图片、PDF、文本、编码、数据与设计等实用在线工具，分类清晰、搜索便捷，打开浏览器即可使用。',
      feature: 'tools',
    },
  },
  {
    path: '/tools/:toolId',
    name: 'tool-detail',
    component: () => import('@/features/tools/pages/ToolDetail.vue'),
    meta: {
      title: '工具 · Meowv Studio',
      description: '使用 Meowv Studio 在线工具处理文件、文本与数据，打开浏览器即可使用。',
      feature: 'tools',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: {
      title: '页面未找到 · Meowv Studio',
      description: '你访问的页面不存在或已被移动，请返回 Meowv Studio 首页继续使用本地文件工作台。',
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
