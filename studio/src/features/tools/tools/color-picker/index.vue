<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { IconCheck, IconCopy } from '@tabler/icons-vue';

type ColorFieldId = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'hsv' | 'cmyk';

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

interface CmykColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

const fieldDefinitions: Array<{ id: ColorFieldId; label: string; placeholder: string }> = [
  { id: 'hex', label: 'HEX', placeholder: '#RRGGBB' },
  { id: 'rgb', label: 'RGB', placeholder: 'rgb(r, g, b)' },
  { id: 'rgba', label: 'RGBA', placeholder: 'rgba(r, g, b, a)' },
  { id: 'hsl', label: 'HSL', placeholder: 'hsl(h, s%, l%)' },
  { id: 'hsla', label: 'HSLA', placeholder: 'hsla(h, s%, l%, a)' },
  { id: 'hsv', label: 'HSV', placeholder: 'hsv(h, s%, v%)' },
  { id: 'cmyk', label: 'CMYK', placeholder: 'cmyk(c%, m%, y%, k%)' },
];
const fields = reactive<Record<ColorFieldId, string>>({
  hex: '#5a9600',
  rgb: 'rgb(90, 150, 0)',
  rgba: 'rgba(90, 150, 0, 1)',
  hsl: 'hsl(90, 100%, 29%)',
  hsla: 'hsla(90, 100%, 29%, 1)',
  hsv: 'hsv(90, 100%, 59%)',
  cmyk: 'cmyk(40%, 0%, 100%, 41%)',
});
const previewHex = ref('#5a9600');
const copiedField = ref<ColorFieldId | null>(null);
let copiedTimer: number | null = null;

function hexToRgb(hex: string): RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => {
      const hex = Math.round(value).toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join('')}`;
}

function rgbToHsl(red: number, green: number, blue: number): HslColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  let hue = 0;
  let saturation = 0;
  const lightness = (maximum + minimum) / 2;

  if (maximum !== minimum) {
    const delta = maximum - minimum;
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (maximum === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }

  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hueToRgb(p: number, q: number, source: number): number {
  let value = source;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  let r = l;
  let g = l;
  let b = l;

  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;

  if (maximum !== minimum) {
    if (maximum === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (maximum === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  return {
    h: Math.round(hue * 360),
    s: Math.round((maximum === 0 ? 0 : delta / maximum) * 100),
    v: Math.round(maximum * 100),
  };
}

function hsvToRgb(hue: number, saturation: number, value: number): RgbColor {
  const h = hue / 360;
  const s = saturation / 100;
  const v = value / 100;
  const sector = Math.floor(h * 6);
  const fraction = h * 6 - sector;
  const p = v * (1 - s);
  const q = v * (1 - fraction * s);
  const t = v * (1 - (1 - fraction) * s);
  let r = v;
  let g = t;
  let b = p;

  switch (sector % 6) {
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToCmyk(red: number, green: number, blue: number): CmykColor {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const black = 1 - Math.max(r, g, b);
  if (black === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - black) / (1 - black)) * 100),
    m: Math.round(((1 - g - black) / (1 - black)) * 100),
    y: Math.round(((1 - b - black) / (1 - black)) * 100),
    k: Math.round(black * 100),
  };
}

function cmykToRgb(cyan: number, magenta: number, yellow: number, black: number): RgbColor {
  const c = cyan / 100;
  const m = magenta / 100;
  const y = yellow / 100;
  const k = black / 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

function parseNumbers(source: string): number[] | null {
  const matches = source.match(/[\d.]+/g);
  if (!matches) return null;
  return matches.map(Number);
}

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

function syncFromRgb(rgb: RgbColor, alpha = 1, sourceHex?: string): void {
  const hex = sourceHex ?? rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  fields.hex = hex;
  fields.rgb = `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
  fields.rgba = `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha})`;
  fields.hsl = `hsl(${hsl.h}, ${percent(hsl.s)}, ${percent(hsl.l)})`;
  fields.hsla = `hsla(${hsl.h}, ${percent(hsl.s)}, ${percent(hsl.l)}, ${alpha})`;
  fields.hsv = `hsv(${hsv.h}, ${percent(hsv.s)}, ${percent(hsv.v)})`;
  fields.cmyk = `cmyk(${percent(cmyk.c)}, ${percent(cmyk.m)}, ${percent(cmyk.y)}, ${percent(cmyk.k)})`;
  previewHex.value = hex;
}

function updateFromHex(source: string): void {
  fields.hex = source;
  if (!/^#[0-9a-fA-F]{6}$/.test(source)) return;
  syncFromRgb(hexToRgb(source), 1, source);
}

function updateFromRgb(source: string, field: 'rgb' | 'rgba'): void {
  fields[field] = source;
  const values = parseNumbers(source);
  if (!values || values.length < 3 || values[0] > 255 || values[1] > 255 || values[2] > 255) return;
  syncFromRgb({ r: values[0], g: values[1], b: values[2] }, values[3] ?? 1);
}

function updateFromHsl(source: string, field: 'hsl' | 'hsla'): void {
  fields[field] = source;
  const values = parseNumbers(source);
  if (!values || values.length < 3 || values[1] > 100 || values[2] > 100) return;
  syncFromRgb(hslToRgb(values[0], values[1], values[2]), values[3] ?? 1);
}

function updateFromHsv(source: string): void {
  fields.hsv = source;
  const values = parseNumbers(source);
  if (!values || values.length < 3 || values[1] > 100 || values[2] > 100) return;
  syncFromRgb(hsvToRgb(values[0], values[1], values[2]));
}

function updateFromCmyk(source: string): void {
  fields.cmyk = source;
  const values = parseNumbers(source);
  if (!values || values.length < 4) return;
  syncFromRgb(cmykToRgb(values[0], values[1], values[2], values[3]));
}

function updateField(id: ColorFieldId, event: Event): void {
  const source = (event.target as HTMLInputElement).value;
  if (id === 'hex') updateFromHex(source);
  else if (id === 'rgb' || id === 'rgba') updateFromRgb(source, id);
  else if (id === 'hsl' || id === 'hsla') updateFromHsl(source, id);
  else if (id === 'hsv') updateFromHsv(source);
  else updateFromCmyk(source);
}

function updatePicker(event: Event): void {
  updateFromHex((event.target as HTMLInputElement).value);
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  return copied;
}

async function copyField(id: ColorFieldId): Promise<void> {
  const text = fields[id];
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else if (!fallbackCopy(text)) return;
  } catch {
    if (!fallbackCopy(text)) return;
  }
  copiedField.value = id;
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copiedField.value = null;
    copiedTimer = null;
  }, 1500);
}

onBeforeUnmount(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="color-converter">
    <div class="color-converter__picker">
      <label class="color-converter__circle" :style="{ background: previewHex }">
        <span class="sr-only">选择颜色</span>
        <input type="color" :value="previewHex" aria-label="选择颜色" @input="updatePicker" />
      </label>
      <strong>{{ previewHex }}</strong>
    </div>

    <div class="color-converter__fields">
      <label v-for="field in fieldDefinitions" :key="field.id" class="color-converter__field">
        <span>{{ field.label }}</span>
        <input
          :value="fields[field.id]"
          type="text"
          :placeholder="field.placeholder"
          :aria-label="`${field.label} 颜色值`"
          autocomplete="off"
          spellcheck="false"
          @input="updateField(field.id, $event)"
        />
        <i :style="{ background: previewHex }" aria-hidden="true"></i>
        <button
          type="button"
          :class="{ 'is-copied': copiedField === field.id }"
          :aria-label="`复制 ${field.label}`"
          @click.prevent="copyField(field.id)"
        >
          <IconCheck v-if="copiedField === field.id" :size="15" aria-hidden="true" />
          <IconCopy v-else :size="15" aria-hidden="true" />
        </button>
      </label>
    </div>
  </section>
</template>

<style scoped>
.color-converter {
  display: grid;
  padding: 22px;
  align-items: center;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 24px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-solid);
}
.color-converter__picker {
  display: flex;
  align-items: center;
  flex-direction: column;
}
.color-converter__circle {
  position: relative;
  width: 140px;
  height: 140px;
  margin-bottom: 15px;
  overflow: hidden;
  border: 4px solid var(--color-surface-soft);
  border-radius: 50%;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--tools-accent) 24%, transparent);
  cursor: pointer;
}
.color-converter__circle input {
  position: absolute;
  top: -30px;
  left: -30px;
  width: 200px;
  height: 200px;
  border: 0;
  background: none;
  cursor: pointer;
}
.color-converter__picker strong {
  color: var(--color-text-muted);
  font:
    600 13px 'SFMono-Regular',
    Consolas,
    monospace;
}
.color-converter__fields {
  display: grid;
  gap: 9px;
}
.color-converter__field {
  display: grid;
  min-width: 0;
  align-items: center;
  grid-template-columns: 48px minmax(0, 1fr) 28px 32px;
  gap: 9px;
}
.color-converter__field > span {
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
}
.color-converter__field input {
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  color: var(--color-text);
  background: var(--color-surface-soft);
  box-sizing: border-box;
  font:
    11px 'SFMono-Regular',
    Consolas,
    monospace;
  transition:
    border-color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
}
.color-converter__field input:focus {
  border-color: var(--tools-accent);
  background: var(--color-surface-solid);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 10%, transparent);
}
.color-converter__field > i {
  display: block;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
}
.color-converter__field button {
  display: grid;
  width: 32px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.2s,
    color 0.2s,
    background 0.2s;
}
.color-converter__field button:hover {
  border-color: var(--tools-accent);
  color: var(--tools-accent);
}
.color-converter__field button.is-copied {
  border-color: var(--tools-accent);
  color: #fff;
  background: var(--tools-accent);
}
@media (max-width: 700px) {
  .color-converter {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .color-converter {
    padding: 14px;
  }
  .color-converter__field {
    grid-template-columns: 44px minmax(0, 1fr) 30px;
  }
  .color-converter__field > i {
    display: none;
  }
}
</style>
