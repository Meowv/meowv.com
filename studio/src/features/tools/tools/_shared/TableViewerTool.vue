<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
const props = defineProps<{ delimiter: ',' | '\t' }>();
const input = ref(
  props.delimiter === ','
    ? 'name,score\nMeowv,100\nStudio,98'
    : 'name\tscore\nMeowv\t100\nStudio\t98',
);
function parse(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('存在未闭合的双引号。');
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const parsed = computed(() => {
  try {
    return { rows: parse(input.value, props.delimiter), error: '' };
  } catch (cause) {
    return {
      rows: [] as string[][],
      error: cause instanceof Error ? cause.message : '表格解析失败。',
    };
  }
});
const rows = computed(() => parsed.value.rows);
const error = computed(() => parsed.value.error);
const output = computed(() => JSON.stringify(rows.value, null, 2));
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection
      :title="delimiter === ',' ? 'CSV 查看器' : 'TSV 查看器'"
      description="本地解析带引号和换行的表格文本。"
      ><ToolInput v-model="input" :label="delimiter === ',' ? 'CSV 文本' : 'TSV 文本'" :rows="14" />
      <p v-if="error" class="tool-status tool-status--error">{{ error }}</p></ToolSection
    ><ToolSection title="表格预览" tone="output"
      ><div class="tool-table-scroll">
        <table v-if="rows.length" class="tool-data-table">
          <tbody>
            <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
              <component
                :is="rowIndex === 0 ? 'th' : 'td'"
                v-for="(cell, cellIndex) in row"
                :key="cellIndex"
                >{{ cell }}</component
              >
            </tr>
          </tbody>
        </table>
        <p v-else>输入表格内容后显示预览。</p>
      </div></ToolSection
    >
  </div>
  <ToolOutput
    title="二维数组 JSON"
    :value="output"
    filename="table.json"
    mime-type="application/json;charset=utf-8"
  /><ToolHelp :steps="['粘贴 CSV 或 TSV。', '检查表格预览。', '下载二维数组 JSON。']" />
</template>
