<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  IconBrandOffice,
  IconChalkboard,
  IconFileTypePdf,
  IconMarkdown,
  IconNotes,
  IconSitemap,
  IconPhoto,
  IconTextScan2,
  IconApps,
} from '@tabler/icons-vue';
import { STUDIO_FILE_ACCEPT, useFileLauncher } from '@/composables/useFileLauncher';
import fileOrbitUrl from '@/assets/images/file-orbit.png';

const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const { error, launchFile } = useFileLauncher();

const quickRoutes = [
  {
    label: 'Image',
    description: '编辑、压缩、转换',
    to: '/image',
    icon: IconPhoto,
    tone: 'image',
  },
  {
    label: 'PDF',
    description: '合并、拆分、标注',
    to: '/pdf',
    icon: IconFileTypePdf,
    tone: 'pdf',
  },
  {
    label: 'OCR',
    description: '图片文字识别',
    to: '/ocr',
    icon: IconTextScan2,
    tone: 'ocr',
  },
  {
    label: 'Markdown',
    description: '写作、预览、导出',
    to: '/markdown',
    icon: IconMarkdown,
    tone: 'markdown',
  },
  {
    label: 'Office',
    description: '打开、编辑、保存',
    to: '/office',
    icon: IconBrandOffice,
    tone: 'office',
  },
  {
    label: 'Whiteboard',
    description: '草图、流程图、无限画布',
    to: '/draw',
    icon: IconChalkboard,
    tone: 'draw',
  },
  {
    label: 'Mind',
    description: '思维导图、Markdown 脑图',
    to: '/mind',
    icon: IconSitemap,
    tone: 'mind',
  },
  {
    label: 'Notes',
    description: '便签、灵感草稿',
    to: '/notes',
    icon: IconNotes,
    tone: 'notes',
  },
  {
    label: 'Tools',
    description: '功能暂未开放',
    to: '/tools',
    icon: IconApps,
    tone: 'tools',
    unavailable: true,
  },
];

const STUDIO_FILE_PICKER_TYPES = [
  {
    description: 'Studio 支持的文件',
    accept: {
      'image/avif': ['.avif'],
      'image/bmp': ['.bmp'],
      'image/gif': ['.gif'],
      'image/heic': ['.heic', '.heif'],
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/vnd.adobe.photoshop': ['.psd'],
      'image/svg+xml': ['.svg'],
      'image/webp': ['.webp'],
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/csv': ['.csv'],
      'application/vnd.excalidraw+json': ['.excalidraw'],
      'application/x-meowv-mind': ['.mind'],
    },
  },
];

const openFile = async () => {
  const picker = window.showOpenFilePicker;
  if (!picker) {
    if (!fileInput.value) return;
    fileInput.value.value = '';
    fileInput.value.click();
    return;
  }

  try {
    const [handle] = await picker({
      multiple: false,
      types: STUDIO_FILE_PICKER_TYPES,
    });
    if (handle) await launchFile(await handle.getFile(), handle);
  } catch (reason) {
    if ((reason as DOMException).name !== 'AbortError') {
      error.value = reason instanceof Error ? reason.message : '无法打开本地文件。';
    }
  }
};

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await launchFile(file);
};

const onDrop = async (event: DragEvent) => {
  dragActive.value = false;
  const item = event.dataTransfer?.items[0] as
    | (DataTransferItem & {
        getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
      })
    | undefined;
  try {
    const handle = await item?.getAsFileSystemHandle?.();
    if (handle?.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      await launchFile(await fileHandle.getFile(), fileHandle);
      return;
    }
  } catch {
    // 无法取得文件句柄时退回普通 File 拖放。
  }
  const file = event.dataTransfer?.files[0];
  if (file) await launchFile(file);
};
</script>

<template>
  <section class="studio-home" aria-labelledby="studio-home-title">
    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      :accept="STUDIO_FILE_ACCEPT"
      aria-label="选择要在 Studio 中打开的本地文件"
      @change="onFileSelected"
    />
    <div class="home-copy">
      <p class="eyebrow">YOUR FILES. YOUR BROWSER.</p>
      <h1 id="studio-home-title" class="home-copy__product home-copy__product--animated">
        Meowv Studio
      </h1>
      <p class="home-copy__summary">
        打开、编辑、转换、导出，一站式处理，<strong>本地处理 · 文件不上传。</strong>
      </p>
      <nav class="home-shortcuts" aria-label="快捷工作台">
        <component
          :is="shortcut.unavailable ? 'div' : RouterLink"
          v-for="shortcut in quickRoutes"
          :key="shortcut.to"
          class="home-shortcuts__item"
          :class="`home-shortcuts__item--${shortcut.tone}`"
          v-bind="shortcut.unavailable ? { 'aria-disabled': 'true' } : { to: shortcut.to }"
        >
          <span class="home-shortcuts__icon" aria-hidden="true">
            <component :is="shortcut.icon" :size="21" stroke-width="1.9" />
          </span>
          <span>
            <strong>{{ shortcut.label }}</strong>
            <small>{{ shortcut.description }}</small>
          </span>
        </component>
      </nav>
      <ul class="home-trust" aria-label="本地处理承诺">
        <li>浏览器本地处理</li>
        <li>无需登录账号</li>
        <li>不保留云端副本</li>
      </ul>
      <p v-if="error" class="home-error" role="alert">{{ error }}</p>
    </div>

    <div
      class="file-portal"
      :class="{ 'file-portal--dragging': dragActive }"
      role="button"
      tabindex="0"
      aria-label="拖放文件到这里，或点击打开本地文件"
      @click="openFile"
      @keydown.enter="openFile"
      @keydown.space.prevent="openFile"
      @dragenter.prevent="dragActive = true"
      @dragover.prevent="dragActive = true"
      @dragleave.prevent="dragActive = false"
      @drop.prevent="onDrop"
    >
      <img class="file-portal__art" :src="fileOrbitUrl" alt="" draggable="false" />
      <div>
        <strong>拖拽文件到这里，或点击打开</strong>
        <small>文件内容不会离开当前设备</small>
      </div>
    </div>
  </section>
</template>
