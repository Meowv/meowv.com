<script setup lang="ts">
import {
  CircleHelp,
  Download,
  FileWarning,
  Laptop,
  MousePointerClick,
  SlidersHorizontal,
  Upload
} from "@lucide/vue";
import { siteConfig } from "~/config/site";

const helpSteps = [
  {
    title: "选择工具",
    description: "回到首页，从整理、转换或编辑分类中选择符合任务的 PDF 工具。",
    icon: MousePointerClick
  },
  {
    title: "添加文件",
    description: "将文件拖入上传区域，或点击按钮从设备中选择。文件不会离开当前浏览器。",
    icon: Upload
  },
  {
    title: "检查并设置",
    description: "等待文件读取完成，根据预览调整页面顺序、范围、格式或其他参数。",
    icon: SlidersHorizontal
  },
  {
    title: "处理与下载",
    description: "点击与任务对应的处理按钮，完成后将新文件下载到设备。",
    icon: Download
  }
] as const;

useSeoMeta({
  title: "使用帮助｜在线 PDF 处理 - Meowv",
  description: "了解如何使用在线 PDF 处理工具、处理大型文件，以及遇到损坏或加密 PDF 时该怎么办。"
});

useHead({
  link: [{ rel: "canonical", href: `${siteConfig.url}/help` }]
});
</script>

<template>
  <div class="content-page section-container">
    <header class="content-page__header">
      <span class="section-kicker">
        <CircleHelp :size="16" />
        使用帮助
      </span>
      <h1>四步完成 PDF 处理</h1>
      <p>无需安装软件或注册账号。选择工具、添加文件、调整设置，然后下载结果。</p>
    </header>

    <ol class="help-steps">
      <li v-for="(step, index) in helpSteps" :key="step.title">
        <span class="help-steps__number">{{ index + 1 }}</span>
        <span class="help-steps__icon" aria-hidden="true">
          <component :is="step.icon" :size="23" />
        </span>
        <div>
          <h2>{{ step.title }}</h2>
          <p>{{ step.description }}</p>
        </div>
      </li>
    </ol>

    <div class="content-page__grid content-page__grid--help">
      <section>
        <Laptop :size="21" aria-hidden="true" />
        <h2>处理大型文件</h2>
        <p>
          浏览器处理能力取决于设备内存、文件页数与页面复杂度。超过 100MB、500
          页或需要大量高分辨率图片时，请优先使用内存充足的桌面浏览器，并关闭不需要的标签页。
        </p>
      </section>

      <section>
        <FileWarning :size="21" aria-hidden="true" />
        <h2>无法读取文件</h2>
        <p>
          请确认文件确实是 PDF 且能在其他阅读器中打开。损坏、格式不完整或受密码保护的 PDF
          会显示明确提示，首期暂不支持加密 PDF。
        </p>
      </section>
    </div>

    <section class="content-page__section">
      <h2>移动端使用建议</h2>
      <p>
        手机和平板可以使用全部工具。参数会在适合小屏幕的区域中展示；处理复杂或页数很多的 PDF
        时，桌面设备通常更稳定。切换应用或锁屏可能使浏览器暂停当前任务。
      </p>
    </section>

    <section class="content-page__section">
      <h2>结果与原文件</h2>
      <p>
        工具始终生成一个新文件，不会覆盖设备上的原始文件。不同 PDF
        的压缩方式、字体嵌入和页面结构不同，重新生成后文件体积可能增大或减小。
      </p>
    </section>

    <div class="content-page__actions">
      <NuxtLink class="button button--primary" to="/#tools">选择一个工具</NuxtLink>
      <NuxtLink class="button button--ghost" to="/privacy">查看隐私说明</NuxtLink>
    </div>
  </div>
</template>
