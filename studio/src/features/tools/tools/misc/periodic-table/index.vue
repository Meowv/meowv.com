<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconSearch } from '@tabler/icons-vue';

type ElementCategory =
  | 'alkali'
  | 'alkaline'
  | 'transition'
  | 'post-transition'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble'
  | 'lanthanide'
  | 'actinide';

interface PeriodicElement {
  n: number;
  s: string;
  na: string;
  m: string;
  c: ElementCategory;
  x: number;
  y: number;
}

const categories: Array<{ id: ElementCategory; name: string; color: string }> = [
  { id: 'nonmetal', name: '非金属', color: '#8E44AD' },
  { id: 'noble', name: '稀有气体', color: '#6C3483' },
  { id: 'alkali', name: '碱金属', color: '#E74C3C' },
  { id: 'alkaline', name: '碱土金属', color: '#E67E22' },
  { id: 'metalloid', name: '类金属', color: '#16A085' },
  { id: 'halogen', name: '卤素', color: '#00BCD4' },
  { id: 'transition', name: '过渡金属', color: '#2980B9' },
  { id: 'post-transition', name: '后过渡金属', color: '#27AE60' },
  { id: 'lanthanide', name: '镧系', color: '#E91E63' },
  { id: 'actinide', name: '锕系', color: '#D35400' },
];

const categoryMap = new Map(categories.map((category) => [category.id, category]));

const elements: PeriodicElement[] = [
  { n: 1, s: 'H', na: '氢', m: '1.008', c: 'nonmetal', x: 1, y: 1 },
  { n: 2, s: 'He', na: '氦', m: '4.0026', c: 'noble', x: 18, y: 1 },
  { n: 3, s: 'Li', na: '锂', m: '6.94', c: 'alkali', x: 1, y: 2 },
  { n: 4, s: 'Be', na: '铍', m: '9.0122', c: 'alkaline', x: 2, y: 2 },
  { n: 5, s: 'B', na: '硼', m: '10.81', c: 'metalloid', x: 13, y: 2 },
  { n: 6, s: 'C', na: '碳', m: '12.011', c: 'nonmetal', x: 14, y: 2 },
  { n: 7, s: 'N', na: '氮', m: '14.007', c: 'nonmetal', x: 15, y: 2 },
  { n: 8, s: 'O', na: '氧', m: '15.999', c: 'nonmetal', x: 16, y: 2 },
  { n: 9, s: 'F', na: '氟', m: '18.998', c: 'halogen', x: 17, y: 2 },
  { n: 10, s: 'Ne', na: '氖', m: '20.180', c: 'noble', x: 18, y: 2 },
  { n: 11, s: 'Na', na: '钠', m: '22.990', c: 'alkali', x: 1, y: 3 },
  { n: 12, s: 'Mg', na: '镁', m: '24.305', c: 'alkaline', x: 2, y: 3 },
  { n: 13, s: 'Al', na: '铝', m: '26.982', c: 'post-transition', x: 13, y: 3 },
  { n: 14, s: 'Si', na: '硅', m: '28.085', c: 'metalloid', x: 14, y: 3 },
  { n: 15, s: 'P', na: '磷', m: '30.974', c: 'nonmetal', x: 15, y: 3 },
  { n: 16, s: 'S', na: '硫', m: '32.06', c: 'nonmetal', x: 16, y: 3 },
  { n: 17, s: 'Cl', na: '氯', m: '35.45', c: 'halogen', x: 17, y: 3 },
  { n: 18, s: 'Ar', na: '氩', m: '39.948', c: 'noble', x: 18, y: 3 },
  { n: 19, s: 'K', na: '钾', m: '39.098', c: 'alkali', x: 1, y: 4 },
  { n: 20, s: 'Ca', na: '钙', m: '40.078', c: 'alkaline', x: 2, y: 4 },
  { n: 21, s: 'Sc', na: '钪', m: '44.956', c: 'transition', x: 3, y: 4 },
  { n: 22, s: 'Ti', na: '钛', m: '47.867', c: 'transition', x: 4, y: 4 },
  { n: 23, s: 'V', na: '钒', m: '50.942', c: 'transition', x: 5, y: 4 },
  { n: 24, s: 'Cr', na: '铬', m: '51.996', c: 'transition', x: 6, y: 4 },
  { n: 25, s: 'Mn', na: '锰', m: '54.938', c: 'transition', x: 7, y: 4 },
  { n: 26, s: 'Fe', na: '铁', m: '55.845', c: 'transition', x: 8, y: 4 },
  { n: 27, s: 'Co', na: '钴', m: '58.933', c: 'transition', x: 9, y: 4 },
  { n: 28, s: 'Ni', na: '镍', m: '58.693', c: 'transition', x: 10, y: 4 },
  { n: 29, s: 'Cu', na: '铜', m: '63.546', c: 'transition', x: 11, y: 4 },
  { n: 30, s: 'Zn', na: '锌', m: '65.38', c: 'transition', x: 12, y: 4 },
  { n: 31, s: 'Ga', na: '镓', m: '69.723', c: 'post-transition', x: 13, y: 4 },
  { n: 32, s: 'Ge', na: '锗', m: '72.630', c: 'metalloid', x: 14, y: 4 },
  { n: 33, s: 'As', na: '砷', m: '74.922', c: 'metalloid', x: 15, y: 4 },
  { n: 34, s: 'Se', na: '硒', m: '78.971', c: 'nonmetal', x: 16, y: 4 },
  { n: 35, s: 'Br', na: '溴', m: '79.904', c: 'halogen', x: 17, y: 4 },
  { n: 36, s: 'Kr', na: '氪', m: '83.798', c: 'noble', x: 18, y: 4 },
  { n: 37, s: 'Rb', na: '铷', m: '85.468', c: 'alkali', x: 1, y: 5 },
  { n: 38, s: 'Sr', na: '锶', m: '87.62', c: 'alkaline', x: 2, y: 5 },
  { n: 39, s: 'Y', na: '钇', m: '88.906', c: 'transition', x: 3, y: 5 },
  { n: 40, s: 'Zr', na: '锆', m: '91.224', c: 'transition', x: 4, y: 5 },
  { n: 41, s: 'Nb', na: '铌', m: '92.906', c: 'transition', x: 5, y: 5 },
  { n: 42, s: 'Mo', na: '钼', m: '95.95', c: 'transition', x: 6, y: 5 },
  { n: 43, s: 'Tc', na: '锝', m: '[97]', c: 'transition', x: 7, y: 5 },
  { n: 44, s: 'Ru', na: '钌', m: '101.07', c: 'transition', x: 8, y: 5 },
  { n: 45, s: 'Rh', na: '铑', m: '102.91', c: 'transition', x: 9, y: 5 },
  { n: 46, s: 'Pd', na: '钯', m: '106.42', c: 'transition', x: 10, y: 5 },
  { n: 47, s: 'Ag', na: '银', m: '107.87', c: 'transition', x: 11, y: 5 },
  { n: 48, s: 'Cd', na: '镉', m: '112.41', c: 'transition', x: 12, y: 5 },
  { n: 49, s: 'In', na: '铟', m: '114.82', c: 'post-transition', x: 13, y: 5 },
  { n: 50, s: 'Sn', na: '锡', m: '118.71', c: 'post-transition', x: 14, y: 5 },
  { n: 51, s: 'Sb', na: '锑', m: '121.76', c: 'metalloid', x: 15, y: 5 },
  { n: 52, s: 'Te', na: '碲', m: '127.60', c: 'metalloid', x: 16, y: 5 },
  { n: 53, s: 'I', na: '碘', m: '126.90', c: 'halogen', x: 17, y: 5 },
  { n: 54, s: 'Xe', na: '氙', m: '131.29', c: 'noble', x: 18, y: 5 },
  { n: 55, s: 'Cs', na: '铯', m: '132.91', c: 'alkali', x: 1, y: 6 },
  { n: 56, s: 'Ba', na: '钡', m: '137.33', c: 'alkaline', x: 2, y: 6 },
  { n: 57, s: 'La', na: '镧', m: '138.91', c: 'lanthanide', x: 3, y: 6 },
  { n: 58, s: 'Ce', na: '铈', m: '140.12', c: 'lanthanide', x: 4, y: 8 },
  { n: 59, s: 'Pr', na: '镨', m: '140.91', c: 'lanthanide', x: 5, y: 8 },
  { n: 60, s: 'Nd', na: '钕', m: '144.24', c: 'lanthanide', x: 6, y: 8 },
  { n: 61, s: 'Pm', na: '钷', m: '[145]', c: 'lanthanide', x: 7, y: 8 },
  { n: 62, s: 'Sm', na: '钐', m: '150.36', c: 'lanthanide', x: 8, y: 8 },
  { n: 63, s: 'Eu', na: '铕', m: '151.96', c: 'lanthanide', x: 9, y: 8 },
  { n: 64, s: 'Gd', na: '钆', m: '157.25', c: 'lanthanide', x: 10, y: 8 },
  { n: 65, s: 'Tb', na: '铽', m: '158.93', c: 'lanthanide', x: 11, y: 8 },
  { n: 66, s: 'Dy', na: '镝', m: '162.50', c: 'lanthanide', x: 12, y: 8 },
  { n: 67, s: 'Ho', na: '钬', m: '164.93', c: 'lanthanide', x: 13, y: 8 },
  { n: 68, s: 'Er', na: '铒', m: '167.26', c: 'lanthanide', x: 14, y: 8 },
  { n: 69, s: 'Tm', na: '铥', m: '168.93', c: 'lanthanide', x: 15, y: 8 },
  { n: 70, s: 'Yb', na: '镱', m: '173.05', c: 'lanthanide', x: 16, y: 8 },
  { n: 71, s: 'Lu', na: '镥', m: '174.97', c: 'lanthanide', x: 17, y: 8 },
  { n: 72, s: 'Hf', na: '铪', m: '178.49', c: 'transition', x: 4, y: 6 },
  { n: 73, s: 'Ta', na: '钽', m: '180.95', c: 'transition', x: 5, y: 6 },
  { n: 74, s: 'W', na: '钨', m: '183.84', c: 'transition', x: 6, y: 6 },
  { n: 75, s: 'Re', na: '铼', m: '186.21', c: 'transition', x: 7, y: 6 },
  { n: 76, s: 'Os', na: '锇', m: '190.23', c: 'transition', x: 8, y: 6 },
  { n: 77, s: 'Ir', na: '铱', m: '192.22', c: 'transition', x: 9, y: 6 },
  { n: 78, s: 'Pt', na: '铂', m: '195.08', c: 'transition', x: 10, y: 6 },
  { n: 79, s: 'Au', na: '金', m: '196.97', c: 'transition', x: 11, y: 6 },
  { n: 80, s: 'Hg', na: '汞', m: '200.59', c: 'transition', x: 12, y: 6 },
  { n: 81, s: 'Tl', na: '铊', m: '204.38', c: 'post-transition', x: 13, y: 6 },
  { n: 82, s: 'Pb', na: '铅', m: '207.2', c: 'post-transition', x: 14, y: 6 },
  { n: 83, s: 'Bi', na: '铋', m: '208.98', c: 'post-transition', x: 15, y: 6 },
  { n: 84, s: 'Po', na: '钋', m: '[209]', c: 'post-transition', x: 16, y: 6 },
  { n: 85, s: 'At', na: '砹', m: '[210]', c: 'halogen', x: 17, y: 6 },
  { n: 86, s: 'Rn', na: '氡', m: '[222]', c: 'noble', x: 18, y: 6 },
  { n: 87, s: 'Fr', na: '钫', m: '[223]', c: 'alkali', x: 1, y: 7 },
  { n: 88, s: 'Ra', na: '镭', m: '[226]', c: 'alkaline', x: 2, y: 7 },
  { n: 89, s: 'Ac', na: '锕', m: '[227]', c: 'actinide', x: 3, y: 7 },
  { n: 90, s: 'Th', na: '钍', m: '232.04', c: 'actinide', x: 4, y: 9 },
  { n: 91, s: 'Pa', na: '镤', m: '231.04', c: 'actinide', x: 5, y: 9 },
  { n: 92, s: 'U', na: '铀', m: '238.03', c: 'actinide', x: 6, y: 9 },
  { n: 93, s: 'Np', na: '镎', m: '[237]', c: 'actinide', x: 7, y: 9 },
  { n: 94, s: 'Pu', na: '钚', m: '[244]', c: 'actinide', x: 8, y: 9 },
  { n: 95, s: 'Am', na: '镅', m: '[243]', c: 'actinide', x: 9, y: 9 },
  { n: 96, s: 'Cm', na: '锔', m: '[247]', c: 'actinide', x: 10, y: 9 },
  { n: 97, s: 'Bk', na: '锫', m: '[247]', c: 'actinide', x: 11, y: 9 },
  { n: 98, s: 'Cf', na: '锎', m: '[251]', c: 'actinide', x: 12, y: 9 },
  { n: 99, s: 'Es', na: '锿', m: '[252]', c: 'actinide', x: 13, y: 9 },
  { n: 100, s: 'Fm', na: '镄', m: '[257]', c: 'actinide', x: 14, y: 9 },
  { n: 101, s: 'Md', na: '钔', m: '[258]', c: 'actinide', x: 15, y: 9 },
  { n: 102, s: 'No', na: '锘', m: '[259]', c: 'actinide', x: 16, y: 9 },
  { n: 103, s: 'Lr', na: '铹', m: '[266]', c: 'actinide', x: 17, y: 9 },
  { n: 104, s: 'Rf', na: '𬬻', m: '[267]', c: 'transition', x: 4, y: 7 },
  { n: 105, s: 'Db', na: '𬭊', m: '[268]', c: 'transition', x: 5, y: 7 },
  { n: 106, s: 'Sg', na: '𬭳', m: '[269]', c: 'transition', x: 6, y: 7 },
  { n: 107, s: 'Bh', na: '𬭛', m: '[270]', c: 'transition', x: 7, y: 7 },
  { n: 108, s: 'Hs', na: '𬭶', m: '[277]', c: 'transition', x: 8, y: 7 },
  { n: 109, s: 'Mt', na: '鿏', m: '[278]', c: 'transition', x: 9, y: 7 },
  { n: 110, s: 'Ds', na: '𫟼', m: '[281]', c: 'transition', x: 10, y: 7 },
  { n: 111, s: 'Rg', na: '𬬭', m: '[282]', c: 'transition', x: 11, y: 7 },
  { n: 112, s: 'Cn', na: '鿔', m: '[285]', c: 'transition', x: 12, y: 7 },
  { n: 113, s: 'Nh', na: '鉨', m: '[286]', c: 'post-transition', x: 13, y: 7 },
  { n: 114, s: 'Fl', na: '𫓧', m: '[289]', c: 'post-transition', x: 14, y: 7 },
  { n: 115, s: 'Mc', na: '镆', m: '[290]', c: 'post-transition', x: 15, y: 7 },
  { n: 116, s: 'Lv', na: '𫟷', m: '[293]', c: 'post-transition', x: 16, y: 7 },
  { n: 117, s: 'Ts', na: '鿬', m: '[294]', c: 'halogen', x: 17, y: 7 },
  { n: 118, s: 'Og', na: '鿫', m: '[294]', c: 'noble', x: 18, y: 7 },
];

const search = ref('');
const activeCategory = ref<ElementCategory | null>(null);
const selected = ref<PeriodicElement | null>(null);

const hasFilter = computed(() => Boolean(search.value.trim() || activeCategory.value));

function categoryFor(categoryId: ElementCategory) {
  return categoryMap.get(categoryId)!;
}

function matchesFilter(element: PeriodicElement): boolean {
  const term = search.value.trim().toLowerCase();
  const matchesCategory = !activeCategory.value || element.c === activeCategory.value;
  const matchesSearch =
    !term ||
    element.na.includes(term) ||
    element.s.toLowerCase().includes(term) ||
    String(element.n) === term;
  return matchesCategory && matchesSearch;
}

function toggleCategory(categoryId: ElementCategory): void {
  activeCategory.value = activeCategory.value === categoryId ? null : categoryId;
}

function elementStyle(element: PeriodicElement): Record<string, string | number> {
  return {
    gridColumn: element.x,
    gridRow: element.y,
    '--element-color': categoryFor(element.c).color,
  };
}

function periodFor(element: PeriodicElement): number {
  if (element.y === 8) return 6;
  if (element.y === 9) return 7;
  return element.y;
}
</script>

<template>
  <section class="periodic-tool">
    <div class="periodic-tool__controls">
      <label class="periodic-tool__search">
        <IconSearch :size="17" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          aria-label="搜索元素"
          placeholder="搜索元素名称、符号或原子序数..."
        />
      </label>

      <div class="periodic-tool__legend" aria-label="按元素分类筛选">
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="periodic-tool__legend-item"
          :class="{ active: activeCategory === category.id }"
          :aria-pressed="activeCategory === category.id"
          @click="toggleCategory(category.id)"
        >
          <span :style="{ background: category.color }" aria-hidden="true"></span>
          {{ category.name }}
        </button>
      </div>
    </div>

    <div class="periodic-tool__grid-wrap">
      <div class="periodic-tool__grid" aria-label="元素周期表">
        <button
          v-for="element in elements"
          :key="element.n"
          type="button"
          class="periodic-tool__element"
          :class="{
            dimmed: hasFilter && !matchesFilter(element),
            highlight: hasFilter && matchesFilter(element),
            selected: selected?.n === element.n,
          }"
          :style="elementStyle(element)"
          :aria-label="`${element.n} ${element.na} ${element.s}`"
          :aria-pressed="selected?.n === element.n"
          @click="selected = element"
        >
          <span class="periodic-tool__number">{{ element.n }}</span>
          <strong>{{ element.s }}</strong>
          <span class="periodic-tool__name">{{ element.na }}</span>
        </button>
      </div>
    </div>

    <aside
      v-if="selected"
      class="periodic-tool__detail"
      :style="{ '--element-color': categoryFor(selected.c).color }"
      aria-live="polite"
    >
      <div class="periodic-tool__detail-header">
        <strong>{{ selected.s }}</strong>
        <div>
          <h2>{{ selected.na }}</h2>
          <p>原子序数 {{ selected.n }} · {{ categoryFor(selected.c).name }}</p>
          <span>{{ categoryFor(selected.c).name }}</span>
        </div>
      </div>

      <dl class="periodic-tool__meta">
        <div>
          <dt>原子序数</dt>
          <dd>{{ selected.n }}</dd>
        </div>
        <div>
          <dt>相对原子质量</dt>
          <dd>{{ selected.m }}</dd>
        </div>
        <div>
          <dt>元素符号</dt>
          <dd>{{ selected.s }}</dd>
        </div>
        <div>
          <dt>周期</dt>
          <dd>{{ periodFor(selected) }}</dd>
        </div>
        <div>
          <dt>族</dt>
          <dd>{{ selected.x }}</dd>
        </div>
      </dl>
    </aside>
  </section>
</template>

<style scoped>
.periodic-tool {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface);
}

.periodic-tool__controls {
  display: flex;
  padding: 14px;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
}

.periodic-tool__search {
  display: flex;
  min-width: 180px;
  height: 36px;
  padding: 0 11px;
  align-items: center;
  flex: 1;
  gap: 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
  transition:
    border-color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
}

.periodic-tool__search:focus-within {
  border-color: var(--tools-accent);
  background: var(--color-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tools-accent) 12%, transparent);
}

.periodic-tool__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 12px;
}

.periodic-tool__legend {
  display: flex;
  flex: 2 1 560px;
  flex-wrap: wrap;
  gap: 6px;
}

.periodic-tool__legend-item {
  display: inline-flex;
  min-height: 26px;
  padding: 3px 9px;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 14px;
  color: var(--color-text-muted);
  background: var(--color-surface-soft);
  font: inherit;
  font-size: 10px;
  white-space: nowrap;
  cursor: pointer;
  transition: 0.2s;
}

.periodic-tool__legend-item:hover {
  color: var(--color-text);
  background: color-mix(in srgb, var(--tools-accent) 7%, var(--color-surface));
}

.periodic-tool__legend-item.active {
  border-color: var(--color-text);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: 0 0 0 1px var(--color-surface);
}

.periodic-tool__legend-item:focus-visible,
.periodic-tool__element:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--tools-accent) 28%, transparent);
  outline-offset: 2px;
}

.periodic-tool__legend-item > span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.periodic-tool__grid-wrap {
  overflow-x: auto;
  padding: 18px;
  background: var(--color-surface-soft);
}

.periodic-tool__grid {
  display: grid;
  min-width: 680px;
  grid-template-columns: repeat(18, minmax(0, 1fr));
  grid-template-rows: repeat(9, 58px);
  gap: 3px;
}

.periodic-tool__element {
  position: relative;
  display: flex;
  min-width: 0;
  padding: 4px 2px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  overflow: hidden;
  border: 0;
  border-radius: 4px;
  color: #fff;
  background: var(--element-color);
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition:
    opacity 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
}

.periodic-tool__element:hover {
  z-index: 2;
  transform: scale(1.14);
  box-shadow: 0 4px 16px rgb(0 0 0 / 30%);
}

.periodic-tool__element.selected {
  z-index: 1;
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 0 0 4px var(--element-color);
}

.periodic-tool__element.highlight {
  z-index: 1;
  transform: scale(1.07);
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 0 14px color-mix(in srgb, var(--element-color) 70%, transparent);
}

.periodic-tool__element.dimmed {
  opacity: 0.18;
}

.periodic-tool__number {
  position: absolute;
  top: 3px;
  left: 4px;
  opacity: 0.82;
  font-size: 7px;
  line-height: 1;
}

.periodic-tool__element strong {
  font-size: 16px;
  line-height: 1.2;
}

.periodic-tool__name {
  opacity: 0.9;
  font-size: 7px;
  line-height: 1;
}

.periodic-tool__detail {
  margin: 16px;
  padding: 18px;
  border-left: 5px solid var(--element-color);
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-surface-soft), var(--color-surface));
}

.periodic-tool__detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.periodic-tool__detail-header > strong {
  min-width: 62px;
  color: var(--element-color);
  font-size: 44px;
  line-height: 1;
  text-align: center;
}

.periodic-tool__detail h2 {
  margin: 0;
  font-size: 20px;
}

.periodic-tool__detail p {
  margin: 3px 0 5px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.periodic-tool__detail-header div > span {
  display: inline-flex;
  padding: 3px 11px;
  border-radius: 12px;
  color: #fff;
  background: var(--element-color);
  font-size: 9px;
  font-weight: 600;
}

.periodic-tool__meta {
  display: flex;
  margin: 16px 0 0;
  flex-wrap: wrap;
  gap: 14px 28px;
}

.periodic-tool__meta > div {
  display: flex;
  min-width: 88px;
  flex-direction: column;
}

.periodic-tool__meta dt {
  color: var(--color-text-muted);
  font-size: 9px;
  letter-spacing: 0.04em;
}

.periodic-tool__meta dd {
  margin: 2px 0 0;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 760px) {
  .periodic-tool__controls,
  .periodic-tool__grid-wrap {
    padding: 12px;
  }

  .periodic-tool__grid {
    min-width: 540px;
    grid-template-rows: repeat(9, 43px);
    gap: 2px;
  }

  .periodic-tool__element {
    padding: 2px 1px;
  }

  .periodic-tool__number {
    top: 2px;
    left: 3px;
    font-size: 6px;
  }

  .periodic-tool__element strong {
    font-size: 12px;
  }

  .periodic-tool__name {
    display: none;
  }

  .periodic-tool__detail {
    margin: 12px;
    padding: 14px;
  }
}

@media (max-width: 520px) {
  .periodic-tool__grid {
    min-width: 400px;
    grid-template-rows: repeat(9, 34px);
    gap: 1.5px;
  }

  .periodic-tool__number {
    top: 1px;
    left: 2px;
    font-size: 5px;
  }

  .periodic-tool__element strong {
    font-size: 10px;
  }

  .periodic-tool__legend-item {
    min-height: 24px;
    padding: 2px 7px;
    font-size: 9px;
  }

  .periodic-tool__detail-header > strong {
    min-width: 48px;
    font-size: 34px;
  }

  .periodic-tool__meta {
    gap: 12px 18px;
  }
}
</style>
