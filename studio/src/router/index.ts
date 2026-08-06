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
    path: '/image/:tool?',
    name: 'image',
    component: () => import('@/features/image/ImageStudioPage.vue'),
    meta: {
      title: 'Image · Meowv Studio',
      description: '在浏览器本地完成图片压缩、转换、裁剪与导出，文件无需上传。',
      feature: 'image',
    },
  },
  {
    path: '/pdf/:tool?',
    name: 'pdf',
    component: () => import('@/features/pdf/PdfStudioPage.vue'),
    meta: {
      title: 'PDF · Meowv Studio',
      description: '在浏览器本地处理 PDF 合并、拆分、整理、转换与编辑，文件无需上传。',
      feature: 'pdf',
    },
  },
  {
    path: '/ocr',
    name: 'ocr',
    component: () => import('@/features/ocr/OcrStudioPage.vue'),
    meta: {
      title: 'OCR 文字识别 · Meowv Studio',
      description: '在浏览器本地识别图片中的中文和英文文字，图片无需上传。',
      feature: 'ocr',
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
    path: '/office',
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
      title: 'Whiteboard · Meowv Studio',
      description: '在浏览器本地绘制草图、流程图和白板内容，画板无需上传。',
      feature: 'draw',
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
  scrollBehavior: () => ({ top: 0 }),
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
