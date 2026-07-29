<script setup lang="ts">
import { Database, FileLock2, HardDrive, Info, ShieldCheck } from "@lucide/vue";
import { siteConfig } from "~/config/site";

useSeoMeta({
  title: "隐私说明｜在线 PDF 处理 - Meowv",
  description:
    "了解在线 PDF 处理如何在浏览器本地读取、处理和导出文件，以及网站会保存和不会保存的信息。"
});

useHead({
  link: [{ rel: "canonical", href: `${siteConfig.url}/privacy` }]
});
</script>

<template>
  <div class="content-page section-container">
    <header class="content-page__header">
      <span class="section-kicker">
        <ShieldCheck :size="16" />
        隐私优先
      </span>
      <h1>隐私说明</h1>
      <p>你的 PDF 和图片由当前浏览器处理。我们不会用文件内容交换便利。</p>
    </header>

    <section class="content-page__highlight" aria-labelledby="privacy-promise">
      <span aria-hidden="true"><FileLock2 :size="25" /></span>
      <div>
        <h2 id="privacy-promise">文件不会上传到服务器</h2>
        <p>
          选择文件后，读取、预览、编辑和导出都在当前页面中完成。本站没有接收文件内容的上传接口，也不会把文件发送给第三方转换服务。
        </p>
      </div>
    </section>

    <div class="content-page__grid">
      <section>
        <HardDrive :size="21" aria-hidden="true" />
        <h2>处理期间</h2>
        <ul>
          <li>文件仅在当前浏览器标签页的内存中参与处理。</li>
          <li>原始文件不会被修改，工具只生成新的结果文件。</li>
          <li>文件名、PDF 内容和页面缩略图不会写入 localStorage 或 Cookie。</li>
          <li>本站不会执行 PDF 内嵌 JavaScript，也不会自动打开其中的外部链接。</li>
        </ul>
      </section>

      <section>
        <Database :size="21" aria-hidden="true" />
        <h2>我们可能保存的设置</h2>
        <ul>
          <li>浅色、深色或跟随系统的主题偏好。</li>
          <li>非敏感的界面偏好和工具默认参数。</li>
          <li>不会保存文件内容、文件名历史、水印文字或输出文件。</li>
        </ul>
      </section>
    </div>

    <section class="content-page__section">
      <h2>关闭页面之后</h2>
      <p>
        页面会释放当前工作区持有的文件引用和临时资源，网站不会保留一份可供之后恢复的副本。浏览器和操作系统如何回收内存由其自身负责，因此我们不会声称能彻底擦除设备上的所有内存痕迹。
      </p>
    </section>

    <section class="content-page__section">
      <h2>站点运行所需的网络请求</h2>
      <p>
        访问网站时，浏览器仍需下载本站的
        HTML、CSS、JavaScript、图标和其他静态资源。这些请求不包含你选择的 PDF
        或图片内容。核心处理引擎、Worker 与字体资源均由本站随构建产物提供，不从公共 CDN 动态加载。
      </p>
    </section>

    <aside class="content-page__note">
      <Info :size="19" aria-hidden="true" />
      <p>
        如果使用公共或共享设备，处理完成后请关闭页面并妥善管理已下载的结果文件。浏览器扩展和设备环境不由本站控制。
      </p>
    </aside>
  </div>
</template>
