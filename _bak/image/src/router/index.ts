import { createRouter, createWebHistory } from "vue-router";

import BatchToolView from "@/views/BatchToolView.vue";
import CropView from "@/views/CropView.vue";
import HomeView from "@/views/HomeView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import PrivacyView from "@/views/PrivacyView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
      meta: {
        title: "Image Studio｜浏览器本地图片处理",
        description:
          "在浏览器本地完成图片压缩、格式转换、尺寸调整与裁剪。无需登录，图片不上传。",
      },
    },
    {
      path: "/compress",
      name: "compress",
      component: BatchToolView,
      props: { mode: "compress" },
      meta: {
        title: "在线图片压缩｜批量压缩 JPG、PNG、WebP - Image Studio",
        description:
          "在浏览器本地批量压缩 JPG、PNG、WebP 图片，实时查看压缩后大小与体积变化。",
      },
    },
    {
      path: "/convert",
      name: "convert",
      component: BatchToolView,
      props: { mode: "convert" },
      meta: {
        title: "在线图片格式转换｜PNG、JPEG、WebP、ICO、SVG - Image Studio",
        description:
          "无需上传图片，在浏览器本地批量转换 PNG、JPEG、WebP、ICO 与 SVG 格式。",
      },
    },
    {
      path: "/resize",
      name: "resize",
      component: BatchToolView,
      props: { mode: "resize" },
      meta: {
        title: "在线调整图片尺寸｜批量缩放图片 - Image Studio",
        description:
          "按固定宽高、百分比或最大边，在浏览器本地批量调整图片尺寸。",
      },
    },
    {
      path: "/crop",
      name: "crop",
      component: CropView,
      meta: {
        title: "在线图片裁剪｜自由比例与常用尺寸 - Image Studio",
        description:
          "在浏览器本地自由裁剪图片，支持常用比例、缩放与精确尺寸导出。",
      },
    },
    {
      path: "/watermark",
      name: "watermark",
      component: () => import("@/views/ImageEffectsView.vue"),
      props: { mode: "watermark" },
      meta: {
        title: "在线添加图片水印｜文字与 Logo 水印 - Image Studio",
        description:
          "在浏览器本地为图片添加文字或 Logo 水印，支持位置、透明度、旋转与平铺。",
      },
    },
    {
      path: "/rounded",
      name: "rounded",
      component: () => import("@/views/ImageEffectsView.vue"),
      props: { mode: "rounded" },
      meta: {
        title: "在线添加图片圆角｜透明圆角导出 - Image Studio",
        description:
          "在浏览器本地为图片添加统一或独立圆角，支持像素、百分比与透明背景导出。",
      },
    },
    {
      path: "/padding",
      name: "padding",
      component: () => import("@/views/ImageEffectsView.vue"),
      props: { mode: "padding" },
      meta: {
        title: "在线图片补边留白｜自定义四边边距 - Image Studio",
        description:
          "在浏览器本地为图片增加四边留白，支持独立边距、纯色、透明与渐变背景。",
      },
    },
    {
      path: "/images-to-pdf",
      name: "images-to-pdf",
      component: () => import("@/views/ImagesToPdfView.vue"),
      meta: {
        title: "在线图片转 PDF｜多图合并 PDF - Image Studio",
        description:
          "在浏览器本地把多张图片合并为 PDF，支持常用纸张、方向、边距与适配方式。",
      },
    },
    {
      path: "/merge-gif",
      name: "merge-gif",
      component: () => import("@/views/MergeGifView.vue"),
      meta: {
        title: "在线合并 GIF｜多张图片制作动图 - Image Studio",
        description:
          "在浏览器本地把多张图片合并为 GIF 动图，支持排序、画布尺寸、FPS、背景和循环设置。",
      },
    },
    {
      path: "/privacy",
      name: "privacy",
      component: PrivacyView,
      meta: {
        title: "隐私说明｜Image Studio",
        description:
          "了解 Image Studio 如何在浏览器本地处理图片，以及文件、预览和结果的生命周期。",
      },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFoundView,
      meta: {
        title: "页面未找到｜Image Studio",
        description: "你访问的 Image Studio 页面不存在。",
      },
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }
    return { top: 0 };
  },
});

router.afterEach((to) => {
  document.title = String(to.meta.title);

  const description = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  );
  if (description) {
    description.content = String(to.meta.description);
  }

  const canonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (canonical) {
    canonical.href = `https://img.meowv.com${to.path === "/" ? "/" : to.path}`;
  }

  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (robots) {
    robots.content =
      to.name === "not-found" ? "noindex,follow" : "index,follow";
  }
});

export default router;
