/**
 * 把发布信息、平台判定与关闭态接成 Vue 响应式状态。
 *
 * 采用模块级单例（与 `useToolsBackground` 一致）：两个推广位组件共用**一次** `version.json` 请求。
 * `device` 不在这里处理 —— 页面拿 `dismissed` 配合 `resolveLivewallPromoVisibility` 自行计算，
 * 保持本 composable 与筛选逻辑解耦。
 */

import { computed, ref, type Component, type ComputedRef, type Ref } from 'vue';
import { IconBrandApple, IconBrandWindows, IconDeviceLaptop } from '@tabler/icons-vue';
import {
  DEFAULT_LIVEWALL_RELEASE,
  LIVEWALL_CHANNELS,
  formatByteSize,
  livewallFeedUrl,
  type LivewallChannel,
  type LivewallFeedSource,
  type LivewallPlatform,
  type LivewallRelease,
} from './livewall-meta';
import { loadLivewallRelease } from './livewall-release';
import { readLivewallPromoDismissed, writeLivewallPromoDismissed } from './livewall-promo';
import {
  detectLivewallPlatform,
  livewallCtaCopy,
  readLivewallPlatformProbe,
  type LivewallCtaCopy,
} from './livewall-platform';

/** 三个推广位组件共用的展示模型，组件只负责渲染。 */
export interface LivewallPromoModel {
  cta: LivewallCtaCopy;
  /** 平台图标；由 composable 统一决定，避免两个组件各写一份映射。 */
  icon: Component;
  /** 可下载时为安装包地址，否则为 `null`（按钮转为禁用态）。 */
  downloadUrl: string | null;
  versionLabel: string | null;
  fileSizeLabel: string | null;
}

export interface UseLivewallPromo {
  model: ComputedRef<LivewallPromoModel>;
  /** 当前生效的发布信息（远端或兜底）。 */
  release: Ref<LivewallRelease>;
  /** 版本信息来自远端还是静态兜底 —— 兜底常量可能与线上漂移，排查时要看它。 */
  releaseSource: Ref<LivewallFeedSource>;
  dismissed: Ref<boolean>;
  dismiss(): void;
}

const platform = ref<LivewallPlatform>('other');
const release = ref<LivewallRelease>(DEFAULT_LIVEWALL_RELEASE);
const releaseSource = ref<LivewallFeedSource>('fallback');
const dismissed = ref(false);
let initialized = false;

/**
 * 关闭态只写 sessionStorage：刷新页面、新开标签页或重新进入站点都会重新露出一次。
 * 存储不可用（隐私模式等）时返回 `null`，此时按"未关闭"处理。
 */
function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = window.sessionStorage;
    const probe = '__meowv_livewall_promo_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

/** 当前平台没有发布通道时退回 Mac（`other` 平台据此拿到兜底文案）。 */
function resolveChannel(value: LivewallPlatform): LivewallChannel | null {
  return LIVEWALL_CHANNELS[value] ?? LIVEWALL_CHANNELS.macos ?? null;
}

function platformIcon(value: LivewallPlatform): Component {
  if (value === 'macos') return IconBrandApple;
  if (value === 'windows') return IconBrandWindows;
  return IconDeviceLaptop;
}

function initialize(): void {
  if (initialized) return;
  initialized = true;

  platform.value = detectLivewallPlatform(readLivewallPlatformProbe());
  dismissed.value = readLivewallPromoDismissed(sessionStore());

  const channel = resolveChannel(platform.value);
  if (!channel) return;
  release.value = channel.release;

  // 失败即退回兜底，不抛错、不阻塞渲染（本地开发下这次请求必然 404）。
  void loadLivewallRelease(
    (url, init) => fetch(url, init),
    livewallFeedUrl(import.meta.env.BASE_URL, channel),
    channel.release,
  ).then((result) => {
    release.value = result.release;
    releaseSource.value = result.source;
  });
}

function dismiss(): void {
  dismissed.value = true;
  writeLivewallPromoDismissed(sessionStore(), true);
}

const cta = computed(() => livewallCtaCopy(platform.value));
const isDownloadable = computed(() => cta.value.kind === 'download');

const model = computed<LivewallPromoModel>(() => {
  const downloadable = isDownloadable.value;
  return {
    cta: cta.value,
    icon: platformIcon(platform.value),
    downloadUrl: downloadable ? release.value.fileURL : null,
    // 版本与体积只在真有安装包时展示，避免 Windows「开发中」时显示 Mac 安装包的信息。
    versionLabel: downloadable ? `v${release.value.version}` : null,
    fileSizeLabel: downloadable ? formatByteSize(release.value.sizeBytes) : null,
  };
});

export function useLivewallPromo(): UseLivewallPromo {
  initialize();

  return { model, release, releaseSource, dismissed, dismiss };
}
