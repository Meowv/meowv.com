<script setup lang="ts">
import { computed, ref } from 'vue';
import { IconSearch } from '@tabler/icons-vue';

const elementSymbols =
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(
    ' ',
  );
const elementNames =
  '氢 氦 锂 铍 硼 碳 氮 氧 氟 氖 钠 镁 铝 硅 磷 硫 氯 氩 钾 钙 钪 钛 钒 铬 锰 铁 钴 镍 铜 锌 镓 锗 砷 硒 溴 氪 铷 锶 钇 锆 铌 钼 锝 钌 铑 钯 银 镉 铟 锡 锑 碲 碘 氙 铯 钡 镧 铈 镨 钕 钷 钐 铕 钆 铽 镝 钬 铒 铥 镱 镥 铪 钽 钨 铼 锇 铱 铂 金 汞 铊 铅 铋 钋 砹 氡 钫 镭 锕 钍 镤 铀 镎 钚 镅 锔 锫 锎 锿 镄 钔 锘 铹 𬬻 𬭊 𬭳 𬭛 𬭶 鐽 錀 鎶 鉨 鈇 镆 鉝 鿬 鿫 鿭'.split(
    ' ',
  );
const elements = elementSymbols.map((symbol, index) => ({
  atomicNumber: index + 1,
  symbol,
  name: elementNames[index] ?? symbol,
  period:
    index < 2
      ? 1
      : index < 10
        ? 2
        : index < 18
          ? 3
          : index < 36
            ? 4
            : index < 54
              ? 5
              : index < 86
                ? 6
                : 7,
}));

const GROUPS: Record<number, number[]> = {
  1: [1, 18],
  2: [1, 2, 13, 14, 15, 16, 17, 18],
  3: [1, 2, 13, 14, 15, 16, 17, 18],
  4: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  6: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  7: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
};
const search = ref('');
const selectedNumber = ref(1);
const selected = computed(() => elements[selectedNumber.value - 1]);
function groupFor(atomicNumber: number, period: number): number {
  if (period === 6 && atomicNumber >= 58 && atomicNumber <= 71) return 3;
  if (period === 7 && atomicNumber >= 90 && atomicNumber <= 103) return 3;
  const start =
    period === 1
      ? 1
      : period === 2
        ? 3
        : period === 3
          ? 11
          : period === 4
            ? 19
            : period === 5
              ? 37
              : period === 6
                ? 55
                : 87;
  const index = atomicNumber - start;
  return GROUPS[period][Math.min(index, GROUPS[period].length - 1)] ?? 3;
}
function fBlockRow(number: number): number | null {
  if (number >= 58 && number <= 71) return 8;
  if (number >= 90 && number <= 103) return 9;
  return null;
}
function styleFor(item: (typeof elements)[number]): Record<string, string | number> {
  const fRow = fBlockRow(item.atomicNumber);
  if (fRow) return { gridColumn: item.atomicNumber - (fRow === 8 ? 54 : 86), gridRow: fRow };
  return { gridColumn: groupFor(item.atomicNumber, item.period), gridRow: item.period };
}
const matches = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return new Set(elements.map((item) => item.atomicNumber));
  return new Set(
    elements
      .filter(
        (item) =>
          item.name.includes(term) ||
          item.symbol.toLowerCase().includes(term) ||
          String(item.atomicNumber) === term,
      )
      .map((item) => item.atomicNumber),
  );
});
</script>

<template>
  <section class="periodic-tool">
    <header class="periodic-tool__toolbar">
      <label
        ><IconSearch :size="16" aria-hidden="true" /><input
          v-model="search"
          aria-label="搜索元素"
          placeholder="元素名、符号或原子序数" /></label
      ><span>118 个元素 · 点击查看详情</span>
    </header>
    <div class="periodic-tool__body">
      <div class="periodic-tool__grid" aria-label="元素周期表">
        <button
          v-for="item in elements"
          :key="item.atomicNumber"
          type="button"
          class="periodic-tool__element"
          :class="{
            muted: !matches.has(item.atomicNumber),
            selected: selectedNumber === item.atomicNumber,
            'f-block': fBlockRow(item.atomicNumber),
          }"
          :style="styleFor(item)"
          :aria-label="`${item.atomicNumber} ${item.name} ${item.symbol}`"
          @click="selectedNumber = item.atomicNumber"
        >
          <small>{{ item.atomicNumber }}</small
          ><strong>{{ item.symbol }}</strong
          ><span>{{ item.name }}</span>
        </button>
      </div>
      <aside class="periodic-tool__detail">
        <span>{{ selected.atomicNumber }}</span
        ><strong>{{ selected.symbol }}</strong>
        <h2>{{ selected.name }}</h2>
        <dl>
          <dt>周期</dt>
          <dd>第 {{ selected.period }} 周期</dd>
          <dt>族</dt>
          <dd>第 {{ groupFor(selected.atomicNumber, selected.period) }} 族</dd>
          <dt>区块</dt>
          <dd>{{ fBlockRow(selected.atomicNumber) ? 'f 区元素' : '主周期表' }}</dd>
        </dl>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.periodic-tool {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 13px;
  background: var(--color-surface);
}
.periodic-tool__toolbar {
  display: flex;
  min-height: 58px;
  padding: 10px 13px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border);
}
.periodic-tool__toolbar label {
  display: flex;
  width: min(100%, 360px);
  height: 34px;
  padding: 0 10px;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.periodic-tool__toolbar input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
}
.periodic-tool__toolbar span {
  color: var(--color-text-muted);
  font-size: 9px;
}
.periodic-tool__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
}
.periodic-tool__grid {
  display: grid;
  overflow: auto;
  min-width: 920px;
  padding: 20px;
  grid-template-columns: repeat(18, minmax(42px, 1fr));
  grid-template-rows: repeat(9, 54px);
  gap: 4px;
  background: var(--color-surface-soft);
}
.periodic-tool__element {
  display: flex;
  min-width: 0;
  padding: 3px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--tools-accent) 24%, var(--color-border));
  border-radius: 5px;
  color: var(--color-text);
  background: color-mix(in srgb, var(--tools-accent) 5%, var(--color-surface));
  font: inherit;
  cursor: pointer;
  transition: 0.15s;
}
.periodic-tool__element:hover,
.periodic-tool__element.selected {
  border-color: var(--tools-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tools-accent) 17%, transparent);
  transform: translateY(-1px);
}
.periodic-tool__element.muted {
  opacity: 0.22;
}
.periodic-tool__element.f-block {
  border-color: color-mix(in srgb, #8b5cf6 28%, var(--color-border));
  background: color-mix(in srgb, #8b5cf6 6%, var(--color-surface));
}
.periodic-tool__element small {
  align-self: flex-start;
  color: var(--color-text-muted);
  font-size: 6px;
}
.periodic-tool__element strong {
  font-size: 14px;
}
.periodic-tool__element span {
  font-size: 7px;
}
.periodic-tool__detail {
  padding: 24px 18px;
  border-left: 1px solid var(--color-border);
  text-align: center;
}
.periodic-tool__detail > span {
  color: var(--color-text-muted);
  font-size: 11px;
}
.periodic-tool__detail > strong {
  display: block;
  margin: 8px 0;
  font-size: 48px;
}
.periodic-tool__detail h2 {
  margin: 0 0 22px;
  font-size: 16px;
}
.periodic-tool__detail dl {
  display: grid;
  margin: 0;
  grid-template-columns: auto 1fr;
  gap: 8px;
  text-align: left;
  font-size: 9px;
}
.periodic-tool__detail dt {
  color: var(--color-text-muted);
}
.periodic-tool__detail dd {
  margin: 0;
  text-align: right;
}
@media (max-width: 900px) {
  .periodic-tool__body {
    overflow: auto;
    grid-template-columns: minmax(920px, 1fr);
  }
  .periodic-tool__detail {
    display: none;
  }
}
</style>
