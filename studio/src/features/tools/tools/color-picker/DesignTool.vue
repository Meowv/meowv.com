<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import {
  colorDetails,
  hexToRgb,
  hslToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  shadePalette,
} from './utils';

type Mode =
  | 'picker'
  | 'hex-rgb'
  | 'rgb-hsl'
  | 'hsl-hex'
  | 'gradient'
  | 'linear'
  | 'radial'
  | 'shadow'
  | 'radius'
  | 'animation'
  | 'grid'
  | 'flex'
  | 'palette'
  | 'material'
  | 'tailwind';
const props = defineProps<{ mode: Mode }>();
const colorA = ref('#7C3AED');
const colorB = ref('#22D3EE');
const r = ref(124);
const g = ref(58);
const b = ref(237);
const h = ref(262);
const s = ref(83);
const l = ref(58);
const angle = ref(135);
const gradientType = ref<'linear' | 'radial'>('linear');
const x = ref(0);
const y = ref(12);
const blur = ref(28);
const spread = ref(-6);
const inset = ref(false);
const topLeft = ref(24);
const topRight = ref(8);
const bottomRight = ref(24);
const bottomLeft = ref(8);
const duration = ref(1200);
const animation = ref('pulse');
const columns = ref(3);
const gap = ref(16);
const direction = ref('row');
const justify = ref('space-between');
const align = ref('center');
const title = computed(
  () =>
    ({
      picker: '颜色选择器',
      'hex-rgb': 'HEX 转 RGB',
      'rgb-hsl': 'RGB 转 HSL',
      'hsl-hex': 'HSL 转 HEX',
      gradient: 'CSS 渐变生成器',
      linear: '线性渐变生成器',
      radial: '径向渐变生成器',
      shadow: 'Box Shadow 生成器',
      radius: 'Border Radius 生成器',
      animation: 'CSS Animation 生成器',
      grid: 'CSS Grid 生成器',
      flex: 'Flex 布局生成器',
      palette: '配色方案生成器',
      material: 'Material 色板',
      tailwind: 'Tailwind 色板',
    })[props.mode],
);

const palette = computed(() => shadePalette(colorA.value));
const result = computed(() => {
  try {
    if (props.mode === 'picker') return JSON.stringify(colorDetails(colorA.value), null, 2);
    if (props.mode === 'hex-rgb') {
      const value = hexToRgb(colorA.value);
      return `rgb(${value.r}, ${value.g}, ${value.b})`;
    }
    if (props.mode === 'rgb-hsl') {
      const value = rgbToHsl(r.value, g.value, b.value);
      return `hsl(${value.h} ${value.s}% ${value.l}%)`;
    }
    if (props.mode === 'hsl-hex') {
      const value = hslToRgb(h.value, s.value, l.value);
      return rgbToHex(value.r, value.g, value.b);
    }
    if (['gradient', 'linear', 'radial'].includes(props.mode)) {
      const type =
        props.mode === 'radial'
          ? 'radial'
          : props.mode === 'linear'
            ? 'linear'
            : gradientType.value;
      return type === 'linear'
        ? `background: linear-gradient(${angle.value}deg, ${normalizeHex(colorA.value)}, ${normalizeHex(colorB.value)});`
        : `background: radial-gradient(circle, ${normalizeHex(colorA.value)}, ${normalizeHex(colorB.value)});`;
    }
    if (props.mode === 'shadow')
      return `box-shadow: ${inset.value ? 'inset ' : ''}${x.value}px ${y.value}px ${blur.value}px ${spread.value}px ${colorA.value};`;
    if (props.mode === 'radius')
      return `border-radius: ${topLeft.value}px ${topRight.value}px ${bottomRight.value}px ${bottomLeft.value}px;`;
    if (props.mode === 'animation') {
      const frames =
        animation.value === 'float'
          ? '0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-16px); }'
          : animation.value === 'fade'
            ? '0% { opacity: 0; }\n  100% { opacity: 1; }'
            : '0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.08); }';
      return `.element {\n  animation: studio-${animation.value} ${duration.value}ms ease-in-out infinite;\n}\n\n@keyframes studio-${animation.value} {\n  ${frames}\n}`;
    }
    if (props.mode === 'grid')
      return `.container {\n  display: grid;\n  grid-template-columns: repeat(${columns.value}, minmax(0, 1fr));\n  gap: ${gap.value}px;\n}`;
    if (props.mode === 'flex')
      return `.container {\n  display: flex;\n  flex-direction: ${direction.value};\n  justify-content: ${justify.value};\n  align-items: ${align.value};\n  gap: ${gap.value}px;\n}`;
    if (props.mode === 'palette') {
      const base = hexToRgb(colorA.value);
      const baseHsl = rgbToHsl(base.r, base.g, base.b);
      return JSON.stringify(
        Array.from({ length: 6 }, (_, index) => {
          const rgb = hslToRgb(baseHsl.h + index * 60, baseHsl.s, baseHsl.l);
          return rgbToHex(rgb.r, rgb.g, rgb.b);
        }),
        null,
        2,
      );
    }
    const prefix = props.mode === 'tailwind' ? '--color-studio' : '--material-studio';
    return Object.entries(palette.value)
      .map(([key, value]) => `${prefix}-${key}: ${value};`)
      .join('\n');
  } catch (cause) {
    return `错误：${cause instanceof Error ? cause.message : '颜色处理失败。'}`;
  }
});
const previewStyle = computed(() => {
  if (['gradient', 'linear', 'radial'].includes(props.mode))
    return { background: result.value.replace(/^background:\s*|;$/g, '') };
  if (props.mode === 'shadow')
    return { background: colorB.value, boxShadow: result.value.replace(/^box-shadow:\s*|;$/g, '') };
  if (props.mode === 'radius')
    return {
      background: colorA.value,
      borderRadius: result.value.replace(/^border-radius:\s*|;$/g, ''),
    };
  return { background: colorA.value };
});
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="title" description="调整参数后实时生成可复制的颜色或 CSS。"
      ><div class="tool-stack">
        <template
          v-if="
            [
              'picker',
              'hex-rgb',
              'gradient',
              'linear',
              'radial',
              'shadow',
              'palette',
              'material',
              'tailwind',
            ].includes(mode)
          "
          ><label class="tool-field"
            ><span>主颜色</span>
            <div class="tool-color-input">
              <input v-model="colorA" type="color" /><input v-model="colorA" /></div></label
        ></template>
        <label v-if="['gradient', 'linear', 'radial', 'shadow'].includes(mode)" class="tool-field"
          ><span>辅助颜色</span>
          <div class="tool-color-input">
            <input v-model="colorB" type="color" /><input v-model="colorB" /></div
        ></label>
        <label v-if="mode === 'gradient'" class="tool-field"
          ><span>渐变类型</span
          ><select v-model="gradientType">
            <option value="linear">线性</option>
            <option value="radial">径向</option>
          </select></label
        >
        <div v-if="mode === 'rgb-hsl'" class="tool-options-grid">
          <label class="tool-field"
            ><span>R</span><input v-model.number="r" type="number" min="0" max="255" /></label
          ><label class="tool-field"
            ><span>G</span><input v-model.number="g" type="number" min="0" max="255" /></label
          ><label class="tool-field"
            ><span>B</span><input v-model.number="b" type="number" min="0" max="255"
          /></label>
        </div>
        <div v-if="mode === 'hsl-hex'" class="tool-options-grid">
          <label class="tool-field"><span>H</span><input v-model.number="h" type="number" /></label
          ><label class="tool-field"
            ><span>S %</span><input v-model.number="s" type="number" min="0" max="100" /></label
          ><label class="tool-field"
            ><span>L %</span><input v-model.number="l" type="number" min="0" max="100"
          /></label>
        </div>
        <label v-if="['gradient', 'linear'].includes(mode)" class="tool-field"
          ><span>角度：{{ angle }}°</span
          ><input v-model.number="angle" type="range" min="0" max="360"
        /></label>
        <div v-if="mode === 'shadow'" class="tool-options-grid">
          <label class="tool-field"><span>X</span><input v-model.number="x" type="number" /></label
          ><label class="tool-field"><span>Y</span><input v-model.number="y" type="number" /></label
          ><label class="tool-field"
            ><span>模糊</span><input v-model.number="blur" type="number" min="0" /></label
          ><label class="tool-field"
            ><span>扩散</span><input v-model.number="spread" type="number" /></label
          ><label class="tool-check"><input v-model="inset" type="checkbox" />内阴影</label>
        </div>
        <div v-if="mode === 'radius'" class="tool-options-grid">
          <label class="tool-field"
            ><span>左上</span><input v-model.number="topLeft" type="number" min="0" /></label
          ><label class="tool-field"
            ><span>右上</span><input v-model.number="topRight" type="number" min="0" /></label
          ><label class="tool-field"
            ><span>右下</span><input v-model.number="bottomRight" type="number" min="0" /></label
          ><label class="tool-field"
            ><span>左下</span><input v-model.number="bottomLeft" type="number" min="0"
          /></label>
        </div>
        <template v-if="mode === 'animation'"
          ><label class="tool-field"
            ><span>动画</span
            ><select v-model="animation">
              <option value="pulse">脉冲</option>
              <option value="float">浮动</option>
              <option value="fade">淡入</option>
            </select></label
          ><label class="tool-field"
            ><span>时长 {{ duration }}ms</span
            ><input v-model.number="duration" type="range" min="200" max="5000" step="100" /></label
        ></template>
        <template v-if="mode === 'grid'"
          ><label class="tool-field"
            ><span>列数</span
            ><input v-model.number="columns" type="number" min="1" max="12" /></label
          ><label class="tool-field"
            ><span>间距</span><input v-model.number="gap" type="number" min="0" /></label
        ></template>
        <template v-if="mode === 'flex'"
          ><label class="tool-field"
            ><span>方向</span
            ><select v-model="direction">
              <option>row</option>
              <option>column</option>
              <option>row-reverse</option>
              <option>column-reverse</option>
            </select></label
          ><label class="tool-field"
            ><span>主轴</span
            ><select v-model="justify">
              <option>flex-start</option>
              <option>center</option>
              <option>space-between</option>
              <option>space-around</option>
              <option>space-evenly</option>
            </select></label
          ><label class="tool-field"
            ><span>交叉轴</span
            ><select v-model="align">
              <option>stretch</option>
              <option>flex-start</option>
              <option>center</option>
              <option>flex-end</option>
            </select></label
          ><label class="tool-field"
            ><span>间距</span><input v-model.number="gap" type="number" min="0" /></label
        ></template>
        <div
          v-if="!['rgb-hsl', 'hsl-hex', 'hex-rgb', 'grid', 'flex', 'animation'].includes(mode)"
          class="tool-design-preview"
          :style="previewStyle"
          aria-label="效果预览"
        ></div>
        <div v-if="['material', 'tailwind'].includes(mode)" class="tool-palette-preview">
          <span
            v-for="(value, key) in palette"
            :key="key"
            :style="{ background: value }"
            :title="`${key}: ${value}`"
          ></span>
        </div></div
    ></ToolSection>
    <ToolOutput :title="`${title}结果`" :value="result" filename="design-result.css" />
  </div>
  <ToolHelp
    :steps="['调整颜色或布局参数。', '实时检查预览效果。', '复制生成结果。']"
    note="所有计算和预览均在浏览器本地完成。"
  />
</template>
