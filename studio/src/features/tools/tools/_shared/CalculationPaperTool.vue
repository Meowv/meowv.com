<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconCalculator, IconEraser } from '@tabler/icons-vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import { calculateExpression } from './misc-utils';

const example = '苹果 12 + 香蕉 8\n买菜 12 元，饮料 8.5 元\n2 × (3 + 4)\n100 ÷ 4 - 5';
const input = ref(example);
const results = ref<Array<{ line: number; source: string; expression: string; value?: number; error?: string }>>([]);
const validCount = computed(() => results.value.filter((item) => item.value !== undefined).length);

function extract(source: string): string {
  return source.replace(/×/g, '*').replace(/÷/g, '/').replace(/[^\d.eE+\-*/%()]/g, '');
}
function calculate(): void {
  results.value = input.value.split(/\r?\n/).map((source, index) => {
    const expression = extract(source);
    if (!expression || !/[+\-*/%]/.test(expression)) return { line: index + 1, source, expression, error: '未找到可计算的算式' };
    try { return { line: index + 1, source, expression, value: calculateExpression(expression) }; }
    catch (cause) { return { line: index + 1, source, expression, error: cause instanceof Error ? cause.message : '计算失败' }; }
  }).filter((item) => item.source.trim());
}
function clear(): void { input.value = ''; results.value = []; }
calculate();
</script>

<template>
  <div class="calculation-paper">
    <section class="calculation-paper__input">
      <header><h2>计算草稿</h2><span>支持混合文字与多行算式</span></header>
      <textarea v-model="input" aria-label="计算草稿" spellcheck="false" placeholder="每行输入一条算式，可以混合说明文字"></textarea>
      <div class="calculation-paper__actions"><button type="button" class="tool-button tool-button--primary" @click="calculate"><IconCalculator :size="16" aria-hidden="true" />计算全部</button><button type="button" class="tool-button tool-button--quiet" @click="input = example; calculate()">使用示例</button><button type="button" class="tool-button tool-button--danger" @click="clear"><IconEraser :size="16" aria-hidden="true" />清空</button></div>
    </section>
    <section class="calculation-paper__results">
      <header><h2>计算结果</h2><span>{{ validCount }} 项有效</span></header>
      <p v-if="!results.length" class="calculation-paper__empty">输入内容后点击“计算全部”。</p>
      <ol><li v-for="item in results" :key="item.line" :class="{ error: item.error }"><div><small>第 {{ item.line }} 行</small><p>{{ item.source }}</p><code v-if="item.expression">{{ item.expression }}</code></div><strong v-if="item.value !== undefined">{{ item.value.toLocaleString('zh-CN', { maximumFractionDigits: 12 }) }}</strong><em v-else>{{ item.error }}</em></li></ol>
    </section>
  </div>
  <ToolHelp :steps="['每行输入一条内容，可在数字和运算符之间写说明文字。', '点击“计算全部”，工具会提取每行算式并独立计算。', '检查原文、提取后的表达式与结果，错误行不会影响其他行。']" note="支持 +、-、×、÷、*、/、%、括号和小数；所有计算在浏览器本地完成。" />
</template>

<style scoped>
.calculation-paper { display: grid; overflow: hidden; min-height: 440px; grid-template-columns: 1fr 1fr; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); }.calculation-paper section { display: flex; min-width: 0; flex-direction: column; }.calculation-paper__results { border-left: 1px solid var(--color-border); }.calculation-paper header { display: flex; min-height: 56px; padding: 10px 14px; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); }.calculation-paper h2 { margin: 0; font-size: 12px; }.calculation-paper header span { color: var(--color-text-muted); font-size: 9px; }.calculation-paper textarea { min-height: 330px; flex: 1; padding: 18px; border: 0; outline: none; color: var(--color-text); background: repeating-linear-gradient(var(--color-surface) 0 29px, var(--color-border) 30px); font: 13px/30px 'SFMono-Regular', Consolas, monospace; resize: vertical; }.calculation-paper__actions { display: flex; padding: 10px 12px; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--color-border); }.calculation-paper ol { margin: 0; padding: 10px 14px; list-style: none; }.calculation-paper li { display: flex; padding: 11px 0; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--color-border); }.calculation-paper li small, .calculation-paper li code { color: var(--color-text-muted); font-size: 9px; }.calculation-paper li p { margin: 3px 0; font-size: 11px; }.calculation-paper li strong { color: var(--tools-accent); font-size: 18px; }.calculation-paper li em { color: #e5484d; font-size: 9px; font-style: normal; }.calculation-paper__empty { margin: auto; color: var(--color-text-muted); font-size: 10px; }@media(max-width:900px){.calculation-paper{grid-template-columns:1fr}.calculation-paper__results{border-top:1px solid var(--color-border);border-left:0}}
</style>
