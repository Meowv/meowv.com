import { createApp } from 'vue';
import { getAllQueryString } from 'ranuts/utils';
import { parseReadonly } from '@ranuts/shared/document-utils';
import { View } from 'ranui/builder';
import { initEmbedApi } from './lib/embed-api';
import { initEvents, setEventUICallbacks } from './lib/events';
import { onCreateNew, openDocumentFromUrl, setUICallbacks } from './lib/document';
import { getDocmentObj } from '@ranuts/shared/store';
import App from './app/App.vue';
import { router } from './app/router';
import { initializeTheme } from './app/theme';
import '@khmyznikov/pwa-install';
import './styles/base.css';

declare global {
  interface Window {
    DocsAPI: { DocEditor: new (elementId: string, config: any) => any };
  }
}

const setWorkspace = (active: boolean) => {
  document.body.classList.toggle('landing-active', !active);
  document.body.classList.toggle('workspace-active', active);
  document.dispatchEvent(new CustomEvent<boolean>('office:workspace-changed', { detail: active }));
};

initEvents();
initEmbedApi();
setUICallbacks({
  hideControlPanel: () => setWorkspace(true),
  showControlPanel: () => setWorkspace(false),
  showMenuGuide: () => undefined,
});
setEventUICallbacks({
  hideControlPanel: () => setWorkspace(true),
  showMenuGuide: () => undefined,
});

initializeTheme();

createApp(App).use(router).mount('#app');

const { file, src, readonly } = getAllQueryString();
const documentUrl = file || src;
const isReadonly = parseReadonly(readonly);
const newExtRaw = getAllQueryString().new;
const newExt = typeof newExtRaw === 'string' ? newExtRaw.replace(/^\./, '').toLowerCase() : '';
const createNewOnLoad = ['docx', 'xlsx', 'pptx'].includes(newExt) && !documentUrl;
const isEmbedded = document.body.classList.contains('embed-mode');

if (documentUrl || isEmbedded || createNewOnLoad) setWorkspace(true);
else setWorkspace(false);

if (documentUrl) {
  try {
    void openDocumentFromUrl(decodeURIComponent(documentUrl), undefined, { readonly: isReadonly });
  } catch {
    void openDocumentFromUrl(documentUrl, undefined, { readonly: isReadonly });
  }
} else if (createNewOnLoad && !isEmbedded) {
  void onCreateNew(`.${newExt}`);
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate || getDocmentObj().fileName) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').then((registration) => registration.update());
  });
}

window.setTimeout(() => {
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const install = View('pwa-install')
    .id('pwa-install')
    .attr('use-local-storage', '')
    .attr('name', 'Meowv Office')
    .attr('description', '无需登录，在浏览器本地打开、编辑并保存 Office 文档。')
    .attr('install-description', '安装后可更快启动；首次加载完整编辑器资源后支持离线使用。');
  if (manifest?.href) install.attr('manifest-url', manifest.href);
  if (icon?.href) install.attr('icon-url', icon.href);
  document.body.appendChild(install.build());
}, 1000);
