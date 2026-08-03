import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("../views/HomeView.vue"),
      meta: { title: "工作簿" },
    },
    {
      path: "/workbook/:id",
      name: "workbook",
      component: () => import("../views/WorkbookView.vue"),
      props: true,
      meta: { title: "编辑" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../views/SettingsView.vue"),
      meta: { title: "设置" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("../views/NotFoundView.vue"),
      meta: { title: "页面未找到" },
    },
  ],
  scrollBehavior(to) {
    if (to.hash) {
      return {
        el: to.hash,
        top: 86,
      };
    }

    return { top: 0 };
  },
});

router.afterEach((to) => {
  const suffix = typeof to.meta.title === "string" ? ` · ${to.meta.title}` : "";
  document.title = `在线 Excel 处理${suffix}`;
});
