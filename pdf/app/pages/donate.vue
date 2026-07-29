<script setup lang="ts">
import { Heart, ServerCog, ShieldCheck, Sparkles } from "@lucide/vue";
import { siteConfig } from "~/config/site";

useSeoMeta({
  title: "捐赠支持｜在线 PDF 处理 - Meowv",
  description: "支持在线 PDF 处理的持续维护、兼容性测试和新功能开发。捐赠完全自愿，不影响功能使用。"
});

useHead({
  link: [{ rel: "canonical", href: `${siteConfig.url}/donate` }]
});
</script>

<template>
  <div class="donate-page section-container">
    <header class="donate-page__header">
      <span class="section-kicker">
        <Heart :size="16" />
        感谢你的支持
      </span>
      <h1>一起让好用的工具保持免费</h1>
      <p>
        如果在线 PDF
        处理为你省下了时间，欢迎扫码支持。每一份心意，都会用于站点维护、浏览器兼容性测试和新功能开发。
      </p>
    </header>

    <div class="donate-page__body">
      <section class="donate-methods" aria-labelledby="donate-methods-title">
        <div class="donate-methods__heading">
          <h2 id="donate-methods-title">选择一种方式</h2>
          <span>扫码前请核对收款方信息</span>
        </div>
        <div class="donate-methods__grid">
          <figure v-for="method in siteConfig.donationMethods" :key="method.name">
            <img :src="method.image" :alt="`${method.name}收款二维码`" width="240" height="240" />
            <figcaption>
              <strong>{{ method.name }}</strong>
              <span>{{ method.hint }}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <aside class="donate-page__aside">
        <span class="donate-page__heart" aria-hidden="true">
          <Heart :size="27" />
          <Sparkles :size="15" />
        </span>
        <h2>你的支持会用在哪里？</h2>
        <ul>
          <li>
            <ServerCog :size="18" aria-hidden="true" />
            <span><strong>站点维护</strong>保持静态资源稳定、快速地送达。</span>
          </li>
          <li>
            <ShieldCheck :size="18" aria-hidden="true" />
            <span><strong>隐私与兼容性</strong>持续测试不同浏览器和复杂 PDF。</span>
          </li>
          <li>
            <Sparkles :size="18" aria-hidden="true" />
            <span><strong>新功能开发</strong>完善现有工具，并谨慎增加真正可用的能力。</span>
          </li>
        </ul>
        <p>捐赠完全自愿。不捐赠也能使用全部已上线功能，不会出现限速或功能差异。</p>
      </aside>
    </div>

    <div class="donate-page__back">
      <span>暂时不方便也没关系，分享给需要的人同样是支持。</span>
      <NuxtLink class="button button--ghost" to="/#tools">继续使用工具</NuxtLink>
    </div>
  </div>
</template>
