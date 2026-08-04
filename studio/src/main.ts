import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initializeTheme } from './composables/useTheme';
import './assets/styles/main.css';

initializeTheme();

createApp(App).use(createPinia()).use(router).mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('Studio Service Worker 注册失败，将继续使用在线模式。', error);
    });
  });
}
