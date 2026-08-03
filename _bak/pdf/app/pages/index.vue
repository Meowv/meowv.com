<script setup lang="ts">
import {
  ArrowDown,
  ArrowRight,
  Download,
  FileCheck2,
  FileLock2,
  Heart,
  LockKeyhole,
  MousePointerClick,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload
} from "@lucide/vue";
import ToolCard from "~/components/common/ToolCard.vue";
import { siteConfig } from "~/config/site";
import { getToolsByCategory, pdfTools, toolCategories } from "~/config/tools";

const faqs = [
  {
    question: "文件会上传到服务器吗？",
    answer: "不会。文件处理在当前浏览器中完成，网站不会主动将文件上传到服务器。"
  },
  {
    question: "使用工具需要注册吗？",
    answer: "不需要。所有首期功能均可直接使用。"
  },
  {
    question: "有文件大小限制吗？",
    answer:
      "网站不设置统一的服务端上传限制，但浏览器处理能力取决于设备内存、文件页数和页面复杂度。处理大型文件时可能需要更多时间和内存。"
  },
  {
    question: "支持带密码的 PDF 吗？",
    answer: "首期暂不支持处理加密 PDF。网站会识别并给出明确提示。"
  },
  {
    question: "手机上可以使用吗？",
    answer: "可以，但大型 PDF 更适合在内存充足的桌面浏览器中处理。"
  },
  {
    question: "为什么处理结果可能比原文件大？",
    answer: "不同 PDF 的图片压缩、字体嵌入和页面结构存在差异。重新生成文件后，体积可能增大或减小。"
  }
] as const;

const privacyFeatures = [
  {
    title: "文件不上传",
    description: "选择的 PDF 与图片留在当前设备，不经过文件上传接口。",
    icon: FileLock2
  },
  {
    title: "无需注册登录",
    description: "打开工具即可使用，不需要账号，也不建立文件历史。",
    icon: LockKeyhole
  },
  {
    title: "浏览器本地处理",
    description: "读取、预览、编辑与导出都由当前浏览器完成。",
    icon: FileCheck2
  }
] as const;

const steps = [
  {
    title: "选择 PDF 工具",
    description: "从 11 个真实可用的工具中选择。",
    icon: MousePointerClick
  },
  { title: "添加本地文件", description: "拖入或从设备中选择 PDF 与图片。", icon: Upload },
  { title: "调整处理参数", description: "预览页面并按需要设置输出。", icon: SlidersHorizontal },
  { title: "下载处理结果", description: "在浏览器中生成并保存新文件。", icon: Download }
] as const;

useSeoMeta({
  title: "在线 PDF 处理｜免费合并、拆分、转换 PDF - Meowv",
  description: siteConfig.description,
  ogTitle: "在线 PDF 处理｜免费合并、拆分、转换 PDF - Meowv",
  ogDescription: siteConfig.description,
  ogType: "website",
  ogUrl: siteConfig.url
});

useHead({
  link: [{ rel: "canonical", href: siteConfig.url }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: siteConfig.name,
            url: siteConfig.url,
            inLanguage: "zh-CN"
          },
          {
            "@type": "SoftwareApplication",
            name: siteConfig.name,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Any",
            url: siteConfig.url,
            description: siteConfig.description,
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "CNY"
            },
            featureList: pdfTools.filter((tool) => tool.enabled).map((tool) => tool.name)
          }
        ]
      })
    }
  ]
});
</script>

<template>
  <div class="home-page">
    <section class="hero section-container" aria-labelledby="hero-title">
      <div class="hero__content">
        <span class="hero__badge">
          <ShieldCheck :size="16" />
          免费 · 无需登录 · 文件不上传
        </span>
        <h1 id="hero-title">在线 PDF 处理</h1>
        <h2>PDF 处理，就在浏览器完成</h2>
        <p>
          合并、拆分、整理、转换和编辑 PDF。无需登录，文件不上传，所有处理均在当前浏览器中完成。
        </p>
        <div class="hero__actions">
          <a class="button button--primary" href="#tools">
            选择一个工具
            <ArrowDown :size="18" aria-hidden="true" />
          </a>
          <NuxtLink class="button button--ghost" to="/privacy">
            查看隐私说明
            <ArrowRight :size="17" aria-hidden="true" />
          </NuxtLink>
        </div>
        <span class="hero__privacy-note">
          <LockKeyhole :size="15" />
          本地处理 · 无需上传 · 用完即走
        </span>
      </div>

      <figure class="hero-visual" aria-hidden="true">
        <img
          src="/images/pdf-hero-v2.png"
          alt=""
          width="1394"
          height="1128"
          fetchpriority="high"
          decoding="async"
        />
      </figure>
    </section>

    <section id="tools" class="tools-section section-container" aria-labelledby="tools-title">
      <div class="section-heading section-heading--center">
        <span>11 个实用工具</span>
        <h2 id="tools-title">你想怎样处理 PDF？</h2>
        <p>选择任务即可开始。每个工具都只在需要时加载处理引擎。</p>
      </div>

      <div class="tool-categories">
        <section v-for="category in toolCategories" :key="category.id" class="tool-category">
          <div class="tool-category__heading">
            <div>
              <h3>{{ category.name }}</h3>
              <p>{{ category.description }}</p>
            </div>
            <span>{{ getToolsByCategory(category.id).length }} 个工具</span>
          </div>
          <div class="tool-grid">
            <ToolCard
              v-for="tool in getToolsByCategory(category.id)"
              :key="tool.slug"
              :tool="tool"
            />
          </div>
        </section>
      </div>
    </section>

    <section class="privacy-section">
      <div class="section-container">
        <div class="privacy-section__intro">
          <span class="section-kicker">
            <ShieldCheck :size="16" />
            隐私优先
          </span>
          <h2>你的文件，只属于你</h2>
          <p>
            选择的文件不会上传到服务器。PDF
            的读取、预览、编辑和导出均在浏览器本地完成。关闭页面后，当前处理内容不会被网站保存。
          </p>
          <NuxtLink to="/privacy">
            了解我们如何保护你的文件
            <ArrowRight :size="17" aria-hidden="true" />
          </NuxtLink>
        </div>

        <div class="privacy-features">
          <article v-for="feature in privacyFeatures" :key="feature.title">
            <span aria-hidden="true">
              <component :is="feature.icon" :size="22" />
            </span>
            <h3>{{ feature.title }}</h3>
            <p>{{ feature.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="steps-section section-container" aria-labelledby="steps-title">
      <div class="section-heading">
        <span>简单四步</span>
        <h2 id="steps-title">从文件到结果，清楚又直接</h2>
        <p>每一步都有明确状态，失败时也会告诉你原因。</p>
      </div>
      <ol class="steps-list">
        <li v-for="(step, index) in steps" :key="step.title">
          <span class="steps-list__number">{{ index + 1 }}</span>
          <span class="steps-list__icon" aria-hidden="true">
            <component :is="step.icon" :size="22" />
          </span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="donation-callout section-container" aria-labelledby="donation-callout-title">
      <div class="donation-callout__icon" aria-hidden="true">
        <Heart :size="25" />
        <Sparkles :size="15" />
      </div>
      <div>
        <span>让免费工具持续生长</span>
        <h2 id="donation-callout-title">喜欢这个工具？欢迎请我们喝杯咖啡</h2>
        <p>
          在线 PDF
          处理会一直免费开放。你的支持将用于站点维护、兼容性测试和新功能开发；不捐赠也不会影响任何功能。
        </p>
      </div>
      <NuxtLink class="button button--secondary" to="/donate">
        捐赠支持
        <ArrowRight :size="17" aria-hidden="true" />
      </NuxtLink>
    </section>

    <section class="faq-section section-container" aria-labelledby="faq-title">
      <div class="section-heading section-heading--center">
        <span>常见问题</span>
        <h2 id="faq-title">使用前，你可能想知道</h2>
      </div>
      <div class="faq-list">
        <details v-for="faq in faqs" :key="faq.question">
          <summary>{{ faq.question }}</summary>
          <p>{{ faq.answer }}</p>
        </details>
      </div>
    </section>
  </div>
</template>
