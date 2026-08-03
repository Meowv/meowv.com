<script setup lang="ts">
import { Coffee, Heart, Sparkles } from "@lucide/vue";

const donationMethods = [
  {
    name: "支付宝",
    hint: "打开支付宝扫一扫",
    image: "https://meowv.com/medias/reward/alipay.png",
  },
  {
    name: "微信",
    hint: "打开微信扫一扫",
    image: "https://meowv.com/medias/reward/wechat.png",
  },
] as const;
</script>

<template>
  <section
    id="donate"
    class="scroll-mt-24 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    aria-labelledby="donation-title"
  >
    <div
      class="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-14 lg:px-8 lg:py-24"
    >
      <div class="max-w-xl">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
        >
          <Heart :size="16" aria-hidden="true" />
          让免费工具持续生长
        </span>
        <h2
          id="donation-title"
          class="mt-5 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl dark:text-white"
        >
          喜欢 Image Studio？欢迎请作者喝杯咖啡
        </h2>
        <p class="mt-5 text-base leading-7 text-slate-600 dark:text-slate-300">
          Image Studio 会持续免费开放。你的支持将用于站点维护、浏览器兼容性测试与新功能开发；不捐赠也不会影响任何功能。
        </p>
      </div>

      <div
        class="relative rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-5 shadow-xl shadow-violet-950/5 sm:p-7 dark:border-violet-900 dark:from-violet-950/45 dark:via-slate-900 dark:to-blue-950/35"
      >
        <span
          class="absolute -top-4 right-7 grid size-12 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25"
          aria-hidden="true"
        >
          <Coffee :size="23" />
          <Sparkles class="absolute -right-1 -top-1" :size="14" />
        </span>

        <div class="grid gap-4 sm:grid-cols-2">
          <figure
            v-for="method in donationMethods"
            :key="method.name"
            class="m-0 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <img
              class="mx-auto aspect-square w-full max-w-[220px] rounded-xl border border-slate-200 bg-white object-contain p-1.5"
              :src="method.image"
              :alt="`${method.name}捐赠二维码`"
              width="220"
              height="220"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
            <figcaption class="mt-3">
              <strong class="block text-sm font-bold text-slate-950 dark:text-white">
                {{ method.name }}
              </strong>
              <span class="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {{ method.hint }}
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  </section>
</template>
