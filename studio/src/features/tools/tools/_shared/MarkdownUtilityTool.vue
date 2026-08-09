<script setup lang="ts">
import { computed, ref } from 'vue';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
const props = defineProps<{ mode: 'preview' | 'toc' }>();
const input = ref('# Meowv Studio\n\n## Tools\n\n浏览器本地工具。\n\n### 使用方式');
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
function slugify(source: string, index: number): string {
  return (
    source
      .trim()
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || `section-${index}`
  );
}
const headings = computed(() => {
  const tokens = md.parse(input.value, {});
  const values: Array<{ level: number; text: string; slug: string }> = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const match = tokens[index].tag.match(/^h([1-6])$/);
    if (tokens[index].type === 'heading_open' && match) {
      const text = tokens[index + 1]?.content ?? '';
      values.push({ level: Number(match[1]), text, slug: slugify(text, values.length + 1) });
    }
  }
  return values;
});
const html = computed(() => {
  const instance = new MarkdownIt({ html: false, linkify: true, typographer: true });
  let index = 0;
  const renderer = instance.renderer.rules.heading_open;
  instance.renderer.rules.heading_open = (tokens, tokenIndex, options, env, self) => {
    const heading = headings.value[index++];
    tokens[tokenIndex].attrSet('id', heading?.slug ?? `section-${index}`);
    return renderer
      ? renderer(tokens, tokenIndex, options, env, self)
      : self.renderToken(tokens, tokenIndex, options);
  };
  return DOMPurify.sanitize(instance.render(input.value));
});
const output = computed(() =>
  props.mode === 'preview'
    ? html.value
    : headings.value
        .map((item) => `${'  '.repeat(Math.max(0, item.level - 1))}- [${item.text}](#${item.slug})`)
        .join('\n'),
);
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="mode === 'preview' ? 'Markdown 预览' : 'Markdown 目录生成'"
      description="输入 Markdown 后实时生成安全预览或目录。"
      ><ToolInput v-model="input" label="Markdown" :rows="16" /></ToolSection
    ><ToolSection v-if="mode === 'preview'" title="安全预览" tone="output">
      <!-- eslint-disable-next-line vue/no-v-html --><!-- 内容已经过 DOMPurify 清理。 -->
      <article class="tool-markdown-preview" v-html="output"></article></ToolSection
    ><ToolOutput v-else title="目录 Markdown" :value="output" filename="toc.md" />
  </div>
  <ToolHelp
    :steps="['输入 Markdown。', '实时解析标题或正文。', '复制生成结果。']"
    note="预览禁用原始 HTML，并使用 DOMPurify 再次清理输出。"
  />
</template>
