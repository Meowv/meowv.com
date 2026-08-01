import { createRouter, createWebHistory } from 'vue-router';
import FormatView from './views/FormatView.vue';
import HomeView from './views/HomeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/doc', component: FormatView, props: { format: 'docx' } },
    { path: '/xls', component: FormatView, props: { format: 'xlsx' } },
    { path: '/ppt', component: FormatView, props: { format: 'pptx' } },
    { path: '/csv', component: FormatView, props: { format: 'csv' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
