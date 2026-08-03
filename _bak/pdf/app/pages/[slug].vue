<script setup lang="ts">
import { ChevronRight, CircleHelp, LockKeyhole } from "@lucide/vue";
import AppToolIcon from "~/components/common/AppToolIcon.vue";
import ToolRunner from "~/components/tools/ToolRunner.vue";
import { getToolBySlug } from "~/config/tools";
import { siteConfig } from "~/config/site";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const tool = computed(() => getToolBySlug(slug.value));

if (!tool.value) {
  throw createError({ statusCode: 404, statusMessage: "没有找到这个 PDF 工具" });
}

const canonical = computed(() => `${siteConfig.url}/${tool.value!.slug}`);
const faqItems = computed(() => [
  {
    question: "文件会上传到服务器吗？",
    answer: "不会。文件读取、预览、处理和导出都在当前浏览器本地完成。"
  },
  {
    question: `使用${tool.value!.name}需要注册吗？`,
    answer: "不需要注册或登录，打开页面后即可使用。"
  },
  {
    question: "可以处理大型 PDF 吗？",
    answer:
      "网站不设置服务端上传限制，但实际能力取决于设备内存、文件页数和页面复杂度。大型文件更适合使用桌面浏览器。"
  }
]);

useSeoMeta({
  title: () => tool.value!.seo.title,
  description: () => tool.value!.seo.description,
  ogTitle: () => tool.value!.seo.title,
  ogDescription: () => tool.value!.seo.description,
  ogType: "website",
  ogUrl: canonical,
  twitterCard: "summary",
  twitterTitle: () => tool.value!.seo.title,
  twitterDescription: () => tool.value!.seo.description
});

useHead({
  link: [{ rel: "canonical", href: canonical }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: () =>
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: tool.value!.name,
              url: canonical.value,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
              description: tool.value!.seo.description
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "首页", item: siteConfig.url },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: tool.value!.name,
                  item: canonical.value
                }
              ]
            },
            {
              "@type": "FAQPage",
              mainEntity: faqItems.value.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer }
              }))
            }
          ]
        })
    }
  ]
});
</script>

<template>
  <div v-if="tool" class="tool-page">
    <div class="container">
      <nav class="breadcrumbs" aria-label="面包屑">
        <NuxtLink to="/">首页</NuxtLink>
        <ChevronRight :size="14" aria-hidden="true" />
        <a href="/#tools">全部工具</a>
        <ChevronRight :size="14" aria-hidden="true" />
        <span aria-current="page">{{ tool.name }}</span>
      </nav>

      <header class="tool-page__intro">
        <span class="tool-page__icon" aria-hidden="true">
          <AppToolIcon :name="tool.icon" :size="27" />
        </span>
        <div>
          <h1>{{ tool.name }}</h1>
          <p>{{ tool.description }} 无需登录，文件不会离开你的设备。</p>
        </div>
      </header>

      <ClientOnly>
        <ToolRunner :slug="tool.slug" />
        <template #fallback>
          <div class="workspace-loading" aria-live="polite">正在准备本地处理工作区…</div>
        </template>
      </ClientOnly>

      <section class="tool-explainer">
        <div>
          <span class="section-kicker"><LockKeyhole :size="16" /> 隐私优先</span>
          <h2>{{ tool.name }}如何保护文件？</h2>
          <p>
            这个工具不会调用文件上传接口。浏览器只在当前标签页的内存中读取文件，
            处理完成或离开页面后会释放预览、临时 Blob 与对象 URL。
          </p>
        </div>
        <div>
          <span class="section-kicker"><CircleHelp :size="16" /> 常见问题</span>
          <details v-for="item in faqItems" :key="item.question">
            <summary>{{ item.question }}</summary>
            <p>{{ item.answer }}</p>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>
