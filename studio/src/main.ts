import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initializeTheme } from './composables/useTheme';
import { registerStudioHeaderToggle } from './core/components/StudioHeaderToggle';
import './assets/styles/main.css';

initializeTheme();
registerStudioHeaderToggle();

const app = createApp(App).use(createPinia()).use(router);

void router.isReady().then(() => app.mount('#app'));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.warn('Studio Service Worker 注册失败，将继续使用在线模式。', error);
      });
  });
}
