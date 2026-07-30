<script setup lang="ts">
import {
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  Heart,
  ShieldCheck,
  SquarePen,
} from "@lucide/vue";
import { useWorkspaceStore } from "@/stores/workspace";

const store = useWorkspaceStore();

function openDonation(): void {
  store.donationOpen = true;
}
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <section class="site-footer__brand" aria-label="产品信息">
        <div class="site-footer__logo">
          <span class="app-logo app-logo--animated" aria-hidden="true">
            <FileText />
          </span>
          <strong class="site-footer__product--animated">Markdown Studio</strong>
        </div>
        <p>浏览器里的本地 Markdown 工作台。无需登录，文件不上传。</p>
        <span class="site-footer__trust">
          <ShieldCheck :size="16" aria-hidden="true" />
          本地处理 · 数据不上传
        </span>
      </section>

      <nav class="site-footer__links" aria-label="页脚导航">
        <div class="site-footer__link-group">
          <strong>Markdown Studio</strong>
          <button type="button" @click="openDonation">
            <Heart :size="14" aria-hidden="true" />
            捐赠支持
          </button>
        </div>

        <div class="site-footer__link-group">
          <strong>更多工具</strong>
          <a
            class="site-footer__product-link"
            href="https://excel.meowv.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileSpreadsheet :size="18" aria-hidden="true" />
            <span>
              <b>在线 Excel 处理</b>
              <small>浏览器里的本地表格工作台</small>
            </span>
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
          <a
            class="site-footer__product-link"
            href="https://pdf.meowv.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText :size="18" aria-hidden="true" />
            <span>
              <b>在线 PDF 处理</b>
              <small>浏览器里的本地 PDF 工具</small>
            </span>
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
          <a
            class="site-footer__product-link"
            href="https://zt.meowv.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <SquarePen :size="18" aria-hidden="true" />
            <span>
              <b>字帖生成</b>
              <small>在线制作 A4 练字纸</small>
            </span>
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
        </div>
      </nav>
    </div>
  </footer>
</template>
