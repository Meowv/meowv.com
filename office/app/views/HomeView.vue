<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import DonationDialog from '../components/DonationDialog.vue';
import ThemeCycleButton from '../components/ThemeCycleButton.vue';
import { onCreateNew, onOpenDocument, openLocalFile } from '../../lib/document';
import {
  clearRecentDocuments,
  getRecentDocumentFile,
  listRecentDocuments,
  listTrashedDocuments,
  moveRecentDocumentToTrash,
  permanentlyDeleteRecentDocument,
  restoreRecentDocument,
  type RecentDocument,
} from '../../lib/recent-documents';

type LibraryTab = 'recent' | 'trash';
type SortMode = 'lastOpened' | 'lastSaved' | 'nameAsc' | 'nameDesc';

const recentDocuments = ref<RecentDocument[]>([]);
const trashedDocuments = ref<RecentDocument[]>([]);
const isDragging = ref(false);
const donationOpen = ref(false);
const activeTab = ref<LibraryTab>('recent');
const query = ref('');
const sortMode = ref<SortMode>('lastOpened');

const refreshDocuments = async () => {
  [recentDocuments.value, trashedDocuments.value] = await Promise.all([listRecentDocuments(), listTrashedDocuments()]);
};

const sourceDocuments = computed(() => (activeTab.value === 'recent' ? recentDocuments.value : trashedDocuments.value));
const visibleDocuments = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN');
  return sourceDocuments.value
    .filter((item) => !keyword || item.name.toLocaleLowerCase('zh-CN').includes(keyword))
    .slice()
    .sort((left, right) => {
      if (sortMode.value === 'nameAsc') return left.name.localeCompare(right.name, 'zh-CN');
      if (sortMode.value === 'nameDesc') return right.name.localeCompare(left.name, 'zh-CN');
      if (sortMode.value === 'lastSaved') return (right.lastSavedAt || 0) - (left.lastSavedAt || 0);
      return activeTab.value === 'recent'
        ? right.lastOpenedAt - left.lastOpenedAt
        : (right.deletedAt || 0) - (left.deletedAt || 0);
    });
});

const createDocument = (extension: 'docx' | 'xlsx' | 'pptx') => void onCreateNew(`.${extension}`);
const openDocument = () => onOpenDocument();
const getExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';
const recentColor = (extension: string) =>
  ({ docx: '#2563b9', xlsx: '#16803d', pptx: '#c5532c', csv: '#0f837d' })[extension] || '#647168';
const formatDate = (value?: number) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(value)
    : '暂无记录';
const formatFileSize = (size: number) =>
  size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

const openDroppedFiles = async (files: FileList | File[]) => {
  const selected = Array.from(files);
  if (selected.length === 0) return;
  if (selected.length > 1) return window.alert('当前版本一次只能编辑一个文件，请只拖入一个文件。');
  const [file] = selected;
  if (!['docx', 'xlsx', 'pptx', 'csv'].includes(getExtension(file.name)))
    return window.alert('暂不支持此格式。首发支持 DOCX、XLSX、PPTX 和 CSV。');
  if (file.size > 100 * 1024 * 1024)
    return window.alert('文件超过 100 MB，浏览器内存不足时可能无法打开。请先压缩或拆分文件。');
  if (file.size > 30 * 1024 * 1024 && !window.confirm('文件较大，打开和保存可能需要较长时间。是否继续？')) return;
  await openLocalFile(file);
};

const openRecentDocument = async (document: RecentDocument) => {
  const file = await getRecentDocumentFile(document);
  if (file) await openLocalFile(file, document.handle);
  else if (document.isNew && ['docx', 'xlsx', 'pptx'].includes(document.extension))
    await onCreateNew(`.${document.extension}`);
  else onOpenDocument();
};

const moveToTrash = async (document: RecentDocument) => {
  if (!window.confirm(`将“${document.name}”移入回收站？这不会删除电脑中的原始文件。`)) return;
  await moveRecentDocumentToTrash(document.id);
  await refreshDocuments();
};
const restore = async (document: RecentDocument) => {
  await restoreRecentDocument(document.id);
  await refreshDocuments();
};
const permanentlyDelete = async (document: RecentDocument) => {
  if (!window.confirm(`彻底删除“${document.name}”的本机记录？这不会删除电脑中的原始文件。`)) return;
  await permanentlyDeleteRecentDocument(document.id);
  await refreshDocuments();
};
const clearRecords = async () => {
  if (!window.confirm('清除全部最近使用与回收站记录？这不会删除电脑中的原始文件。')) return;
  await clearRecentDocuments();
  await refreshDocuments();
};

onMounted(() => {
  void refreshDocuments();
  window.addEventListener('office:recent-documents-changed', refreshDocuments);
});
onBeforeUnmount(() => window.removeEventListener('office:recent-documents-changed', refreshDocuments));
</script>

<template>
  <header class="site-header">
    <div class="wrap site-header__inner">
      <RouterLink class="brand" to="/"
        ><img class="brand-mark" src="/brand/office-mark.svg" alt="" /><span class="brand-copy"
          ><b>Meowv Office</b></span
        ></RouterLink
      >
      <div class="header-actions">
        <button class="support-button" type="button" @click="donationOpen = true">捐赠支持</button>
        <ThemeCycleButton />
      </div>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <div class="hero-copy">
        <p class="eyebrow"><span></span> 浏览器本地处理 · 文件内容不上传</p>
        <h1>在浏览器中编辑 <em>Office 文件</em></h1>
        <p class="hero-description">
          无需安装、无需登录，直接打开 Word、Excel、PowerPoint 和 CSV。编辑与转换都在当前浏览器完成。
        </p>
        <div class="hero-actions">
          <button class="button button--primary" type="button" @click="openDocument">打开本地文件</button>
          <button class="button" type="button" @click="createDocument('docx')">新建 Word</button>
          <button class="button" type="button" @click="createDocument('xlsx')">新建 Excel</button>
          <button class="button" type="button" @click="createDocument('pptx')">新建 PPT</button>
        </div>
        <ul class="trust-list" aria-label="产品特点">
          <li>无需注册</li>
          <li>不设文件服务器</li>
          <li>支持自动回写原文件</li>
          <li>DOCX · XLSX · PPTX · CSV</li>
        </ul>
      </div>
      <div class="local-preview" aria-label="浏览器本地编辑示意">
        <div class="local-preview__bar"><span>年度计划.docx</span><b>本地</b></div>
        <div class="local-preview__tabs">
          <span>文件</span><span class="active">开始</span><span>插入</span><span>布局</span>
        </div>
        <div class="local-preview__body">
          <div class="paper">
            <span class="line line--title"></span><span class="line"></span><span class="line line--short"></span
            ><mark>所有内容只在你的浏览器中处理。</mark><span class="line"></span>
          </div>
          <div class="privacy-meter"><span></span> 文件内容上传：0</div>
        </div>
      </div>
    </section>

    <section class="wrap drop-section" aria-labelledby="drop-title">
      <div
        class="drop-zone"
        :class="{ 'is-dragging': isDragging }"
        role="button"
        tabindex="0"
        @click="openDocument"
        @keydown.enter.prevent="openDocument"
        @keydown.space.prevent="openDocument"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="
          isDragging = false;
          openDroppedFiles($event.dataTransfer?.files ?? []);
        "
      >
        <div class="drop-zone__icon" aria-hidden="true">＋</div>
        <div>
          <h2 id="drop-title">拖入一个 Office 文件</h2>
          <p>或点击选择本地文件。当前一次编辑一个文件。</p>
        </div>
        <span>支持 .docx / .xlsx / .pptx / .csv</span>
      </div>
    </section>

    <section class="section section--recent wrap library" aria-labelledby="library-title">
      <div class="library__heading">
        <div>
          <h2 id="library-title">{{ activeTab === 'recent' ? '最近使用' : '回收站' }}</h2>
          <p>
            {{
              activeTab === 'recent'
                ? '仅保存本机文件记录；已授权的文件可直接再次打开。'
                : '回收站只管理本机记录，不会删除电脑中的原始文件。'
            }}
          </p>
        </div>
        <div class="library__tabs" role="tablist" aria-label="文件分类">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'recent'"
            :class="{ active: activeTab === 'recent' }"
            @click="activeTab = 'recent'"
          >
            最近使用</button
          ><button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'trash'"
            :class="{ active: activeTab === 'trash' }"
            @click="activeTab = 'trash'"
          >
            回收站 <span v-if="trashedDocuments.length">{{ trashedDocuments.length }}</span>
          </button>
        </div>
      </div>
      <div class="library__toolbar">
        <label class="search-field"
          ><span aria-hidden="true">⌕</span><span class="sr-only">搜索文件</span
          ><input v-model="query" type="search" placeholder="搜索文件名" /></label
        ><label class="sort-field"
          ><span class="sr-only">排序方式</span
          ><select v-model="sortMode">
            <option value="lastOpened">最近打开</option>
            <option value="lastSaved">最近保存</option>
            <option value="nameAsc">名称 A–Z</option>
            <option value="nameDesc">名称 Z–A</option>
          </select></label
        ><button class="text-button text-button--danger" type="button" @click="clearRecords">清除全部记录</button>
      </div>
      <div v-if="visibleDocuments.length" class="document-grid">
        <article v-for="document in visibleDocuments" :key="document.id" class="document-card">
          <button
            class="document-card__main"
            type="button"
            :disabled="activeTab === 'trash'"
            :aria-label="activeTab === 'recent' ? `打开 ${document.name}` : document.name"
            @click="openRecentDocument(document)"
          >
            <span class="document-card__type" :style="{ '--recent-color': recentColor(document.extension) }">{{
              document.extension.toUpperCase().slice(0, 4)
            }}</span
            ><span class="document-card__content"
              ><b :title="document.name">{{ document.name }}</b
              ><small>{{
                document.isNew
                  ? '未保存的新建文件'
                  : `${formatFileSize(document.size)} · ${document.handle ? '已授权本地文件' : '需重新选择文件'}`
              }}</small></span
            >
          </button>
          <dl>
            <div>
              <dt>{{ activeTab === 'recent' ? '打开' : '删除' }}</dt>
              <dd>{{ formatDate(activeTab === 'recent' ? document.lastOpenedAt : document.deletedAt) }}</dd>
            </div>
            <div>
              <dt>保存</dt>
              <dd>{{ formatDate(document.lastSavedAt) }}</dd>
            </div>
          </dl>
          <div class="document-card__actions">
            <template v-if="activeTab === 'recent'"
              ><button type="button" @click="openRecentDocument(document)">打开</button
              ><button class="danger" type="button" @click="moveToTrash(document)">移入回收站</button></template
            ><template v-else
              ><button type="button" @click="restore(document)">恢复</button
              ><button class="danger" type="button" @click="permanentlyDelete(document)">彻底删除</button></template
            >
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <span aria-hidden="true">□</span>
        <h3>{{ query ? '没有找到匹配的文件' : activeTab === 'recent' ? '还没有最近使用的文件' : '回收站是空的' }}</h3>
        <p>
          {{
            query
              ? '换个文件名试试。'
              : activeTab === 'recent'
                ? '打开一个本地文件后，它会显示在这里。'
                : '移入回收站的文件记录会显示在这里。'
          }}
        </p>
        <button
          v-if="activeTab === 'recent' && !query"
          class="button button--primary"
          type="button"
          @click="openDocument"
        >
          打开本地文件
        </button>
      </div>
    </section>

    <section class="section section--tinted">
      <div class="wrap">
        <div class="section-heading">
          <h2>隐私不是口号，而是架构边界</h2>
        </div>
        <div class="feature-grid">
          <article>
            <span>01</span>
            <h3>文件内容不上传</h3>
            <p>解析、编辑、转换和导出均在当前浏览器中完成。</p>
          </article>
          <article>
            <span>02</span>
            <h3>无需登录</h3>
            <p>没有账户系统，也不建立云端文件库或编辑历史。</p>
          </article>
          <article>
            <span>03</span>
            <h3>核心资源同源</h3>
            <p>编辑器、WASM 与字体资源由本站托管，不依赖第三方在线实例。</p>
          </article>
          <article>
            <span>04</span>
            <h3>可离线使用</h3>
            <p>首次在线加载完整编辑器资源后，可继续处理本地文件。</p>
          </article>
        </div>
      </div>
    </section>

    <section class="section wrap info-section" aria-labelledby="guide-title">
      <div class="section-heading">
        <h2 id="guide-title">使用说明与常见问题</h2>
      </div>
      <details open>
        <summary>如何打开和保存文件？</summary>
        <p>
          通过“打开本地文件”授权打开的文件会在编辑后自动回写原文件。拖入文件或不支持 File System Access API
          的浏览器，会在编辑器中通过下载保存新版本。
        </p>
      </details>
      <details>
        <summary>本地数据和网络请求如何处理？</summary>
        <p>
          本站没有文件上传、账户、云端文档库或服务端转换。最近使用与回收站只记录文件名、格式、大小、时间和经授权的文件句柄，不保存文件内容。
        </p>
      </details>
      <details>
        <summary>兼容性和开源许可</summary>
        <p>
          首发支持 DOCX、XLSX、PPTX 与 CSV，不执行 VBA、宏、ActiveX 或嵌入脚本。编辑核心基于同源 OnlyOffice
          资源，相关版权与 AGPL-3.0 许可保留在项目源码中。
        </p>
      </details>
      <details open>
        <summary>文件真的不会上传吗？</summary>
        <p>
          是。本站不提供文件上传接口；本地文件内容只在浏览器内存中处理。主动打开远程 URL 时，浏览器会请求该目标地址。
        </p>
      </details>
      <details>
        <summary>支持哪些格式？</summary>
        <p>首发正式支持 DOCX、XLSX、PPTX 和 CSV。DOC、XLS、PPT 等旧格式不作为首发兼容承诺。</p>
      </details>
      <details>
        <summary>CSV 会保留格式和多个工作表吗？</summary>
        <p>不会。CSV 只能保存纯数据，不保留样式、图片、图表和多个工作表；需要完整内容时请另存为 XLSX。</p>
      </details>
      <details>
        <summary>离线使用有什么条件？</summary>
        <p>需要先在线完整加载一次编辑器和 WASM 资源。浏览器清除站点数据后，需要重新加载。</p>
      </details>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <section class="site-footer__brand" aria-label="产品信息">
        <RouterLink class="brand" to="/"
          ><img class="brand-mark" src="/brand/office-mark.svg" alt="" /><span class="brand-copy"
            ><b>Meowv Office</b></span
          ></RouterLink
        >
        <p>免费的浏览器本地 Office 编辑器。无需登录，文件内容不上传。</p>
        <span class="site-footer__trust">✓ 本地处理 · 数据不上传</span>
      </section>
      <nav class="site-footer__links" aria-label="页脚导航">
        <div class="site-footer__link-group">
          <strong>服务与支持</strong><a href="#guide">使用与隐私说明</a
          ><button type="button" @click="donationOpen = true">捐赠支持</button>
        </div>
        <div class="site-footer__link-group site-footer__link-group--products">
          <strong>更多工具</strong
          ><a class="site-footer__product-link" href="https://img.meowv.com/" target="_blank" rel="noopener noreferrer"
            ><b>Image Studio</b><small>浏览器里的本地图片处理工具</small><span>↗</span></a
          ><a class="site-footer__product-link" href="https://md.meowv.com/" target="_blank" rel="noopener noreferrer"
            ><b>Markdown Studio</b><small>浏览器里的本地 Markdown 工作台</small><span>↗</span></a
          ><a class="site-footer__product-link" href="https://pdf.meowv.com/" target="_blank" rel="noopener noreferrer"
            ><b>在线 PDF 处理</b><small>浏览器里的本地 PDF 工具</small><span>↗</span></a
          ><a class="site-footer__product-link" href="https://zt.meowv.com/" target="_blank" rel="noopener noreferrer"
            ><b>字帖生成</b><small>在线制作 A4 练字纸</small><span>↗</span></a
          >
        </div>
      </nav>
    </div>
  </footer>
  <DonationDialog :open="donationOpen" @close="donationOpen = false" />
</template>
