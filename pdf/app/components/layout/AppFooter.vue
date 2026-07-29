<script setup lang="ts">
import { ArrowUpRight, FileSpreadsheet, FileText, ShieldCheck, SquarePen } from "@lucide/vue";
import AppLogo from "~/components/layout/AppLogo.vue";
import { siteConfig } from "~/config/site";

const currentYear = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <section class="site-footer__brand" aria-label="产品信息">
        <AppLogo />
        <p>免费的浏览器本地 PDF 工具。无需登录，文件不上传。</p>
        <span class="site-footer__trust">
          <ShieldCheck :size="16" />
          本地处理 · 数据不上传
        </span>
      </section>

      <nav class="site-footer__links" aria-label="页脚导航">
        <div class="site-footer__link-group">
          <strong>在线 PDF 处理</strong>
          <NuxtLink to="/">首页</NuxtLink>
          <NuxtLink to="/#tools">全部工具</NuxtLink>
          <NuxtLink to="/privacy">隐私说明</NuxtLink>
          <NuxtLink to="/help">使用帮助</NuxtLink>
          <NuxtLink to="/donate">捐赠支持</NuxtLink>
        </div>

        <div class="site-footer__link-group">
          <strong>Meowv 工具</strong>
          <a
            class="site-footer__product-link"
            :href="siteConfig.links.worksheet"
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
          <a
            class="site-footer__product-link"
            :href="siteConfig.links.excel"
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
            :href="siteConfig.links.meowv"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText :size="18" aria-hidden="true" />
            <span>
              <b>Meowv</b>
              <small>发现更多内容与工具</small>
            </span>
            <ArrowUpRight :size="15" aria-hidden="true" />
          </a>
        </div>
      </nav>
    </div>

    <div class="site-footer__bottom">
      <span>© {{ currentYear }} Meowv</span>
      <span>原始文件不会被修改，结果由你的浏览器生成</span>
    </div>
  </footer>
</template>
