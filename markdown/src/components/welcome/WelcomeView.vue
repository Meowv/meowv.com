<script setup lang="ts">
import {
  CheckCircle2,
  FolderOpen,
  History,
  ShieldCheck,
  Sparkles,
} from "@lucide/vue";
import WelcomeFooter from "@/components/welcome/WelcomeFooter.vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();
</script>

<template>
  <main id="main-content" class="welcome">
    <section class="welcome__hero" aria-labelledby="welcome-title">
      <div>
        <span class="welcome__eyebrow">
          <Sparkles :size="14" aria-hidden="true" />
          无需登录 · 数据不上传
        </span>
        <h1 id="welcome-title">Markdown Studio</h1>
        <p class="welcome__lead">
          打开你的 Markdown
          文件夹，管理文档、专注写作并实时预览。文件始终留在当前设备，不上传，也不经过服务器。
        </p>

        <div class="welcome__actions">
          <button
            class="primary-button"
            type="button"
            :disabled="store.busy || !store.fileSystemSupported"
            @click="store.openLocalWorkspace"
          >
            <FolderOpen :size="19" aria-hidden="true" />
            {{ store.busy ? "正在打开…" : "打开 Markdown 文件夹" }}
          </button>
          <button
            v-if="store.recentDirectory"
            class="secondary-button"
            type="button"
            :disabled="store.busy"
            @click="store.reopenRecentWorkspace"
          >
            <History :size="18" aria-hidden="true" />
            重新打开 {{ store.recentDirectory.name }}
          </button>
          <button
            class="secondary-button"
            type="button"
            :disabled="store.busy"
            @click="store.loadDemoWorkspace"
          >
            体验示例工作区
          </button>
        </div>

        <div class="welcome__trust" aria-label="产品特点">
          <span><CheckCircle2 :size="15" />无需注册</span>
          <span><CheckCircle2 :size="15" />不上传文件</span>
          <span><CheckCircle2 :size="15" />直接保存到本地</span>
        </div>

        <div id="privacy" class="privacy-callout">
          <ShieldCheck :size="22" aria-hidden="true" />
          <div>
            <strong>文件仅在浏览器与本地文件系统之间处理</strong>
            <p>Markdown 内容、图片和附件不会进入 Cookie、日志或远程数据库。</p>
          </div>
        </div>

        <p v-if="!store.fileSystemSupported" class="unsupported-notice">
          当前浏览器不支持 File System Access
          API。你仍可体验示例工作区；若要直接读写本地文件夹，请使用最新版 Chrome
          或 Edge。
        </p>
      </div>

      <div class="welcome-visual">
        <img
          src="/images/markdown-studio-workspace.png"
          alt="Markdown Studio 浅色工作台，左侧为文件树，中间编辑 Markdown，右侧实时预览"
        />
      </div>
    </section>

    <WelcomeFooter />
  </main>
</template>
