<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconArrowsExchange } from '@tabler/icons-vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import { convertUnit, unitFamilies, type UnitFamily } from './unit-converters';
const props = defineProps<{ family: UnitFamily }>();
const value = ref(1);
const from = ref('');
const to = ref('');
const result = ref<number | null>(null);
const error = ref('');
const units = computed(() => unitFamilies[props.family]);
const labels: Record<UnitFamily, string> = {
  length: '长度',
  weight: '重量',
  temperature: '温度',
  area: '面积',
  volume: '体积',
  speed: '速度',
};
watch(
  units,
  (next) => {
    from.value = next[0]?.id ?? '';
    to.value = next[1]?.id ?? next[0]?.id ?? '';
    result.value = null;
  },
  { immediate: true },
);
const output = computed(() =>
  result.value === null
    ? ''
    : `${value.value} ${units.value.find((unit) => unit.id === from.value)?.label}\n= ${Number(result.value.toPrecision(12))} ${units.value.find((unit) => unit.id === to.value)?.label}`,
);
function convert(): void {
  error.value = '';
  try {
    result.value = convertUnit(props.family, value.value, from.value, to.value);
  } catch (cause) {
    result.value = null;
    error.value = cause instanceof Error ? cause.message : '单位转换失败。';
  }
}
function swap(): void {
  [from.value, to.value] = [to.value, from.value];
  if (result.value !== null) {
    value.value = result.value;
    convert();
  }
}
</script>
<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="`${labels[family]}转换`" description="选择源单位与目标单位进行精确换算。">
      <div class="tool-stack">
        <label class="tool-field"
          ><span>数值</span><input v-model.number="value" type="number" step="any"
        /></label>
        <div class="tool-inline-fields">
          <label class="tool-field"
            ><span>从</span
            ><select v-model="from">
              <option v-for="unit in units" :key="unit.id" :value="unit.id">
                {{ unit.label }}
              </option>
            </select></label
          ><label class="tool-field"
            ><span>到</span
            ><select v-model="to">
              <option v-for="unit in units" :key="unit.id" :value="unit.id">
                {{ unit.label }}
              </option>
            </select></label
          >
        </div>
        <ToolActions
          ><button type="button" class="tool-button tool-button--primary" @click="convert">
            <IconArrowsExchange :size="16" aria-hidden="true" />转换</button
          ><button type="button" class="tool-button tool-button--quiet" @click="swap">
            交换单位
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error">{{ error }}</p>
      </div>
    </ToolSection>
    <ToolOutput :title="`${labels[family]}转换结果`" :value="output" filename="unit-result.txt" />
  </div>
  <ToolHelp :steps="['输入数值并选择单位。', '点击转换。', '复制精确结果。']" />
</template>
