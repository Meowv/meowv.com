<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconRefresh, IconSearch } from '@tabler/icons-vue';
import Globe, { type GlobeInstance } from 'globe.gl';
import countriesUrl from '@/assets/tools/globe/countries.geojson?url';
import earthDayUrl from '@/assets/tools/globe/earth-day.jpg?url';
import earthTopologyUrl from '@/assets/tools/globe/earth-topology.png?url';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';

interface CountryFeature {
  type: 'Feature';
  bbox?: [number, number, number, number];
  properties: {
    ADMIN?: string;
    NAME?: string;
    ISO_A3?: string;
    CONTINENT?: string;
    POP_EST?: number;
  };
  geometry: object;
}

const host = ref<HTMLDivElement | null>(null);
const search = ref('');
const selected = ref<CountryFeature | null>(null);
const loading = ref(true);
const error = ref('');
const autoRotate = ref(true);
let globe: GlobeInstance | null = null;
let countries: CountryFeature[] = [];
let resizeObserver: ResizeObserver | null = null;

function resize(): void {
  if (!host.value || !globe) return;
  globe.width(host.value.clientWidth).height(Math.max(430, host.value.clientHeight));
}

function selectCountry(country: CountryFeature): void {
  selected.value = country;
  const bbox = country.bbox;
  if (!bbox || !globe) return;
  globe.pointOfView({ lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2, altitude: 1.35 }, 900);
}

function findCountry(): void {
  const term = search.value.trim().toLowerCase();
  if (!term) return;
  const match = countries.find((country) =>
    [country.properties.ADMIN, country.properties.NAME, country.properties.ISO_A3]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term)),
  );
  if (!match) {
    error.value = '没有找到匹配的国家或地区，请尝试英文名称或 ISO 三字码。';
    return;
  }
  error.value = '';
  selectCountry(match);
}

function resetView(): void {
  selected.value = null;
  globe?.pointOfView({ lat: 22, lng: 105, altitude: 2.35 }, 800);
}

function updateRotation(): void {
  if (!globe) return;
  globe.controls().autoRotate = autoRotate.value;
  globe.controls().autoRotateSpeed = 0.45;
}

onMounted(async () => {
  await nextTick();
  if (!host.value) return;
  try {
    globe = new Globe(host.value, { rendererConfig: { antialias: true, alpha: true } })
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl(earthDayUrl)
      .bumpImageUrl(earthTopologyUrl)
      .showAtmosphere(true)
      .atmosphereColor('#75b8ff')
      .atmosphereAltitude(0.18)
      .polygonAltitude(0.006)
      .polygonCapColor(() => 'rgba(255,255,255,0.04)')
      .polygonSideColor(() => 'rgba(0,72,86,0.12)')
      .polygonStrokeColor(() => 'rgba(225,245,248,0.7)')
      .polygonLabel((value) => {
        const country = value as CountryFeature;
        const population = country.properties.POP_EST?.toLocaleString('zh-CN') ?? '未知';
        return `<strong>${country.properties.ADMIN ?? country.properties.NAME ?? '未知'}</strong><br>ISO: ${country.properties.ISO_A3 ?? '-'}<br>人口估算: ${population}`;
      })
      .onPolygonClick((value) => selectCountry(value as CountryFeature));
    globe.controls().enableDamping = true;
    globe.controls().dampingFactor = 0.08;
    updateRotation();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host.value);
    resize();
    const response = await fetch(countriesUrl);
    if (!response.ok) throw new Error('Natural Earth 国家边界数据加载失败。');
    const collection = (await response.json()) as { features: CountryFeature[] };
    countries = collection.features;
    globe.polygonsData(countries);
    resetView();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '当前设备无法初始化 WebGL 地球。';
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  globe?._destructor();
  resizeObserver = null;
  globe = null;
});
</script>

<template>
  <section class="globe-tool">
    <div class="globe-tool__toolbar">
      <form class="globe-tool__search" @submit.prevent="findCountry">
        <input v-model="search" aria-label="搜索国家或地区" placeholder="英文名称或 ISO 三字码，如 China / CHN" />
        <button type="submit" class="tool-button tool-button--primary"><IconSearch :size="16" aria-hidden="true" />定位</button>
      </form>
      <label class="tool-switch"><input v-model="autoRotate" type="checkbox" @change="updateRotation" />自动旋转</label>
      <button type="button" class="tool-button tool-button--secondary" @click="resetView"><IconRefresh :size="16" aria-hidden="true" />复位</button>
    </div>
    <div class="globe-tool__stage">
      <div ref="host" class="globe-tool__canvas" aria-label="可交互三维地球"></div>
      <div v-if="loading" class="globe-tool__state">正在加载本地 Natural Earth 数据…</div>
      <div v-else-if="error && !globe" class="globe-tool__state globe-tool__state--error" role="alert">{{ error }}</div>
      <aside v-if="selected" class="globe-tool__country" aria-live="polite">
        <strong>{{ selected.properties.ADMIN ?? selected.properties.NAME }}</strong>
        <span>{{ selected.properties.ISO_A3 }} · {{ selected.properties.CONTINENT }}</span>
        <span>人口估算 {{ selected.properties.POP_EST?.toLocaleString('zh-CN') ?? '未知' }}</span>
      </aside>
    </div>
    <p v-if="error && globe" class="tool-status tool-status--error" role="alert">{{ error }}</p>
  </section>
  <ToolHelp
    :steps="['拖动旋转地球，滚轮缩放。', '点击国家边界查看信息。', '输入英文名称或 ISO 三字码快速定位。']"
    note="三维渲染、Natural Earth 110m 边界数据与地球纹理均从项目本地资源加载；边界不用于法律或行政判断。"
  />
</template>

<style scoped>
.globe-tool { overflow: hidden; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); }
.globe-tool__toolbar { display: flex; min-height: 58px; padding: 9px 12px; align-items: center; gap: 10px; border-bottom: 1px solid var(--color-border); }
.globe-tool__search { display: flex; min-width: 260px; flex: 1; gap: 8px; }
.globe-tool__search input { min-width: 0; height: 34px; flex: 1; padding: 0 11px; border: 1px solid var(--color-border); border-radius: 8px; color: var(--color-text); background: var(--color-surface); }
.globe-tool__stage { position: relative; min-height: 500px; background: radial-gradient(circle at 50% 45%, #153f58, #08131f 64%, #05090e); }
.globe-tool__canvas { position: absolute; inset: 0; min-height: 500px; }
.globe-tool__state { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; color: #d8eaf2; background: rgb(5 14 23 / 78%); font-size: 12px; }
.globe-tool__state--error { color: #ffc1c1; }
.globe-tool__country { position: absolute; z-index: 3; right: 14px; bottom: 14px; display: grid; min-width: 180px; padding: 12px 14px; border: 1px solid rgb(255 255 255 / 20%); border-radius: 9px; color: #fff; background: rgb(3 14 24 / 76%); backdrop-filter: blur(8px); gap: 3px; }
.globe-tool__country strong { font-size: 13px; }.globe-tool__country span { color: #bcd1dc; font-size: 10px; }
@media (max-width: 700px) { .globe-tool__toolbar { align-items: stretch; flex-direction: column; } .globe-tool__search { min-width: 0; } .globe-tool__stage, .globe-tool__canvas { min-height: 420px; } }
</style>
