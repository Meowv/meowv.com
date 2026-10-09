<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  IconBrandOffice,
  IconBook,
  IconChalkboard,
  IconLayout2,
  IconMarkdown,
  IconChartDots3,
  IconSitemap,
  IconNotes,
  IconApps,
  IconWallpaper,
} from '@tabler/icons-vue';
import {
  STUDIO_FILE_ACCEPT,
  STUDIO_FILE_PICKER_TYPES,
  useFileLauncher,
} from '@/composables/useFileLauncher';
import { useImagePaste } from '@/features/tools/tools/_shared/image/composables/useImagePaste';
import ToolsBackgroundShortcut from '@/features/tools/components/ToolsBackgroundShortcut.vue';
import fileOrbitUrl from '@/assets/images/file-orbit.png';

const dragActive = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const { error, launchFile } = useFileLauncher();

useImagePaste((files) => launchFile(files[0]!), { multiple: false });

const quickRoutes = [
  {
    label: 'Markdown',
    description: '写作、编辑、预览、导出',
    to: '/markdown',
    icon: IconMarkdown,
    tone: 'markdown',
  },
  {
    label: 'Office',
    description: 'Word、Excel、PPT 在线编辑',
    to: '/office',
    icon: IconBrandOffice,
    tone: 'office',
  },
  {
    label: 'Books',
    description: '仿真书阅读 PDF',
    to: '/books',
    icon: IconBook,
    tone: 'books',
  },
  {
    label: 'Whiteboard',
    description: '画图、流程图、无限画布',
    to: '/draw',
    icon: IconChalkboard,
    tone: 'draw',
  },
  {
    label: 'Floor Plan',
    description: '户型设计、家具布置、3D 漫游',
    to: '/floorplan',
    icon: IconLayout2,
    tone: 'floorplan',
  },
  {
    label: 'Mermaid',
    description: '编辑、预览、分享图表',
    to: '/mermaid',
    icon: IconChartDots3,
    tone: 'mermaid',
  },
  {
    label: 'Mind',
    description: '思维导图、知识整理',
    to: '/mind',
    icon: IconSitemap,
    tone: 'mind',
  },
  {
    label: 'Notes',
    description: '便签、灵感随手记录',
    to: '/notes',
    icon: IconNotes,
    tone: 'notes',
  },
  {
    label: 'Wallpapers',
    description: '电脑和手机壁纸',
    to: '/wallpapers',
    icon: IconWallpaper,
    tone: 'wallpapers',
  },
  {
    label: 'Tools',
    description: '超多实用工具',
    to: '/tools',
    icon: IconApps,
    tone: 'tools',
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
    <ToolsBackgroundShortcut />
    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      :accept="STUDIO_FILE_ACCEPT"
      aria-label="选择要在 Studio 中打开的本地文件"
      @change="onFileSelected"
    />
    <div class="home-copy">
      <div class="home-copy__main">
        <p class="eyebrow">YOUR FILES. YOUR BROWSER.</p>
        <h1 id="studio-home-title" class="home-copy__product home-copy__product--animated">
          Meowv Studio
        </h1>
        <p class="home-copy__summary">
          本地处理，无需上传文件，直接在浏览器中<strong>打开、编辑、转换和导出。</strong>
        </p>
        <nav class="home-shortcuts" aria-label="快捷工作台">
          <RouterLink
            v-for="shortcut in quickRoutes"
            :key="shortcut.to"
            class="home-shortcuts__item"
            :class="`home-shortcuts__item--${shortcut.tone}`"
            :to="shortcut.to"
          >
            <span class="home-shortcuts__icon" aria-hidden="true">
              <component :is="shortcut.icon" :size="21" stroke-width="1.9" />
            </span>
            <span>
              <strong>{{ shortcut.label }}</strong>
              <small>{{ shortcut.description }}</small>
            </span>
          </RouterLink>
        </nav>
      </div>
      <div class="home-status">
        <ul class="home-trust" aria-label="本地处理承诺">
          <li>不保留云端副本</li>
          <li>浏览器本地处理</li>
          <li>无需登录账号</li>
        </ul>
        <p v-if="error" class="home-error" role="alert">{{ error }}</p>
      </div>
    </div>

    <div
      class="file-portal"
      :class="{ 'file-portal--dragging': dragActive }"
      role="button"
      tabindex="0"
      aria-label="拖放文件到这里、粘贴图片，或点击打开本地文件"
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
        <strong>拖拽文件到这里，粘贴图片，或点击打开</strong>
        <small>文件内容不会离开当前设备</small>
      </div>
    </div>
  </section>
</template>
