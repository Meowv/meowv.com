<script setup lang="ts">
import {
  ArrowDown,
  ArrowRight,
  ChevronDown,
  Download,
  FileCheck2,
  FileLock2,
  LockKeyhole,
  MousePointerClick,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "@lucide/vue";
import { RouterLink } from "vue-router";

import DonationSection from "@/components/home/DonationSection.vue";
import { tools, type ToolDefinition } from "@/config/tools";

const enabledToolCount = tools.filter((tool) => tool.enabled).length;

const privacyFeatures = [
  {
    title: "图片不上传",
    description: "选择的原图与处理结果都留在当前设备，不经过文件上传接口。",
    icon: FileLock2,
  },
  {
    title: "无需注册登录",
    description: "打开工具即可使用，不需要账号，也不会建立图片处理历史。",
    icon: LockKeyhole,
  },
  {
    title: "浏览器本地处理",
    description: "读取、预览、调整和导出都由当前浏览器完成。",
    icon: FileCheck2,
  },
] as const;

const steps = [
  {
    title: "选择图片工具",
    description: "从压缩、转换、尺寸调整或裁剪中选择任务。",
    icon: MousePointerClick,
  },
  {
    title: "添加本地图片",
    description: "拖入图片，或从当前设备中选择一个或多个文件。",
    icon: Upload,
  },
  {
    title: "调整处理参数",
    description: "预览效果，并按需要设置质量、格式或尺寸。",
    icon: SlidersHorizontal,
  },
  {
    title: "下载处理结果",
    description: "在浏览器中生成新文件并保存，原图不会被修改。",
    icon: Download,
  },
] as const;

const faqs = [
  {
    question: "图片会上传到服务器吗？",
    answer:
      "不会。图片读取、预览与处理都在当前浏览器中完成，Image Studio 不提供接收图片内容的上传接口。",
  },
  {
    question: "可以一次处理多张图片吗？",
    answer:
      "可以。图片压缩、格式转换、尺寸调整、图片转 PDF 与 GIF 制作都支持添加多张图片。",
  },
  {
    question: "为什么有些格式可能无法导出？",
    answer:
      "不同浏览器对 WebP 等图片格式的编码支持并不完全一致。工具会先检测当前浏览器能力，并在不支持时给出提示。",
  },
  {
    question: "手机上可以使用吗？",
    answer:
      "可以。处理超大图片或较多文件时，桌面设备通常拥有更充足的内存，也会更加稳定。",
  },
] as const;

function toolCardComponent(tool: ToolDefinition): typeof RouterLink | "article" {
  return tool.enabled && tool.route ? RouterLink : "article";
}

function toolCardProps(tool: ToolDefinition): Record<string, string> {
  if (tool.enabled && tool.route) {
    return { to: tool.route };
  }
  return { "aria-disabled": "true" };
}
</script>

<template>
  <main id="main-content" class="overflow-hidden bg-white dark:bg-slate-950">
    <section
      class="mx-auto grid max-w-7xl items-start gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-8 lg:px-8 lg:py-20"
      aria-labelledby="hero-title"
    >
      <div class="relative z-10 max-w-2xl">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
        >
          <ShieldCheck :size="16" aria-hidden="true" />
          免费 · 无需登录 · 图片不上传
        </span>
        <h1
          id="hero-title"
          class="image-studio-wordmark mt-6 text-4xl leading-[1.08] font-black sm:text-5xl lg:text-6xl"
        >
          Image Studio
        </h1>
        <h2
          class="mt-3 text-2xl leading-tight font-bold tracking-[-0.03em] text-violet-700 sm:text-3xl dark:text-violet-300"
        >
          图片批处理，就在浏览器完成
        </h2>
        <p class="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
          压缩、转换、调整尺寸、裁剪、添加效果，并合成 PDF 或 GIF。无需安装软件，也无需上传图片，打开页面即可开始。
        </p>

        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <RouterLink
            class="primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-base font-bold shadow-lg shadow-violet-600/20 outline-none transition hover:bg-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 active:translate-y-px dark:focus-visible:ring-violet-900"
            to="/compress"
          >
            开始处理图片
            <ArrowRight :size="18" aria-hidden="true" />
          </RouterLink>
          <a
            class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-bold text-slate-700 outline-none transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-violet-700 dark:hover:bg-violet-950 dark:hover:text-violet-300 dark:focus-visible:ring-violet-900"
            href="#tools"
          >
            查看全部工具
            <ArrowDown :size="18" aria-hidden="true" />
          </a>
        </div>

        <span class="mt-5 flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
          <LockKeyhole :size="15" aria-hidden="true" />
          本地处理 · 批量操作 · 用完即走
        </span>
      </div>

      <figure
        class="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[2rem] bg-[#f5f6fb] shadow-2xl shadow-violet-950/10 ring-1 ring-slate-200/80 lg:mt-8 lg:justify-self-end dark:ring-slate-700"
        aria-hidden="true"
      >
        <img
          class="block h-auto w-full"
          src="/images/image-studio-hero.png"
          alt=""
          width="1254"
          height="1254"
          fetchpriority="high"
          decoding="async"
        />
      </figure>
    </section>

    <section
      id="tools"
      class="scroll-mt-24 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
      aria-labelledby="tools-title"
    >
      <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <header class="mx-auto max-w-2xl text-center">
          <span class="text-sm font-black tracking-[0.18em] text-violet-700 uppercase dark:text-violet-300">
            {{ enabledToolCount }} 个图片工具现已开放
          </span>
          <h2
            id="tools-title"
            class="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl dark:text-white"
          >
            你想怎样处理图片？
          </h2>
          <p class="mt-4 text-base leading-7 text-slate-600 dark:text-slate-400">
            选择任务即可开始。所有核心处理均在当前浏览器中进行。
          </p>
        </header>

        <div class="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <component
            :is="toolCardComponent(tool)"
            v-for="tool in tools"
            :key="tool.slug"
            v-bind="toolCardProps(tool)"
            class="group relative flex min-h-56 flex-col rounded-2xl border bg-white p-6 outline-none transition dark:bg-slate-950"
            :class="
              tool.enabled
                ? 'border-slate-200 shadow-sm hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl hover:shadow-violet-950/5 focus-visible:ring-4 focus-visible:ring-violet-200 dark:border-slate-800 dark:hover:border-violet-700 dark:focus-visible:ring-violet-900'
                : 'cursor-not-allowed border-dashed border-slate-300 opacity-70 dark:border-slate-700'
            "
          >
            <div class="flex items-start justify-between gap-4">
              <span
                class="grid size-12 place-items-center rounded-xl ring-1 transition"
                :class="
                  tool.enabled
                    ? 'bg-violet-50 text-violet-700 ring-violet-100 group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900'
                    : 'bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'
                "
                aria-hidden="true"
              >
                <component :is="tool.icon" :size="23" :stroke-width="1.9" />
              </span>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-bold"
                :class="
                  tool.enabled
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                "
              >
                {{ tool.enabled ? "立即使用" : "即将上线" }}
              </span>
            </div>

            <h3 class="mt-6 text-xl font-bold text-slate-950 dark:text-white">{{ tool.name }}</h3>
            <p class="mt-2 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {{ tool.description }}
            </p>
            <span
              v-if="tool.enabled"
              class="mt-5 inline-flex items-center gap-1 text-sm font-bold text-violet-700 dark:text-violet-300"
            >
              打开工具
              <ArrowRight
                class="transition-transform group-hover:translate-x-1"
                :size="16"
                aria-hidden="true"
              />
            </span>
            <span v-else class="mt-5 text-sm font-semibold text-slate-400 dark:text-slate-500">
              正在认真打磨
            </span>
          </component>
        </div>
      </div>
    </section>

    <section
      class="privacy-section bg-slate-950 text-white"
      aria-labelledby="privacy-title"
    >
      <div class="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
        <div class="max-w-xl">
          <span class="inline-flex items-center gap-2 text-sm font-black text-violet-300">
            <ShieldCheck :size="16" aria-hidden="true" />
            隐私优先
          </span>
          <h2 id="privacy-title" class="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
            你的图片，只属于你
          </h2>
          <p class="mt-5 text-base leading-7 text-slate-300">
            Image Studio
            直接在浏览器本地读取、预览、处理与导出图片。关闭页面后，当前处理内容不会被网站保存。
          </p>
          <RouterLink
            class="mt-7 inline-flex items-center gap-2 rounded-lg text-sm font-bold text-violet-300 outline-none transition hover:text-violet-200 focus-visible:ring-4 focus-visible:ring-violet-900"
            to="/privacy"
          >
            了解我们如何保护你的图片
            <ArrowRight :size="17" aria-hidden="true" />
          </RouterLink>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <article
            v-for="feature in privacyFeatures"
            :key="feature.title"
            class="rounded-2xl border border-slate-800 bg-slate-900 p-5"
          >
            <span
              class="grid size-10 place-items-center rounded-xl bg-violet-950 text-violet-300"
              aria-hidden="true"
            >
              <component :is="feature.icon" :size="21" />
            </span>
            <h3 class="mt-5 font-bold text-white">{{ feature.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-400">{{ feature.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <section
      class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24"
      aria-labelledby="steps-title"
    >
      <header class="max-w-2xl">
        <span class="text-sm font-black tracking-[0.18em] text-violet-700 uppercase dark:text-violet-300">
          简单四步
        </span>
        <h2
          id="steps-title"
          class="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl dark:text-white"
        >
          从原图到结果，清楚又直接
        </h2>
        <p class="mt-4 text-base leading-7 text-slate-600 dark:text-slate-400">
          每一步都有明确状态，处理失败时也会说明原因。
        </p>
      </header>

      <ol class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <li
          v-for="(step, index) in steps"
          :key="step.title"
          class="relative rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="text-xs font-black tracking-[0.16em] text-violet-700 dark:text-violet-300">
            STEP {{ index + 1 }}
          </span>
          <span
            class="mt-5 grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            aria-hidden="true"
          >
            <component :is="step.icon" :size="21" />
          </span>
          <h3 class="mt-5 font-bold text-slate-950 dark:text-white">{{ step.title }}</h3>
          <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            {{ step.description }}
          </p>
        </li>
      </ol>
    </section>

    <DonationSection />

    <section
      class="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
      aria-labelledby="faq-title"
    >
      <div class="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
        <header class="text-center">
          <span class="text-sm font-black tracking-[0.18em] text-violet-700 uppercase dark:text-violet-300">
            常见问题
          </span>
          <h2
            id="faq-title"
            class="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl dark:text-white"
          >
            使用前，你可能想知道
          </h2>
        </header>

        <div class="mt-10 grid gap-3">
          <details
            v-for="faq in faqs"
            :key="faq.question"
            class="group rounded-2xl border border-slate-200 bg-white px-5 py-4 open:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:open:border-violet-700"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-950 outline-none marker:hidden focus-visible:text-violet-700 dark:text-white dark:focus-visible:text-violet-300"
            >
              <span>{{ faq.question }}</span>
              <ChevronDown
                class="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                :size="19"
                aria-hidden="true"
              />
            </summary>
            <p class="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-400">
              {{ faq.answer }}
            </p>
          </details>
        </div>
      </div>
    </section>
  </main>
</template>
