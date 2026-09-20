/**
 * 平台识别与行动号召（CTA）形态。
 *
 * 目标：**不让 Windows / Linux 用户看到"下载 macOS 版"**。
 * 有发布通道的平台 → 下载；没有的 → 「开发中 / 敬请期待」。
 */

import {
  LIVEWALL_APP_NAME,
  LIVEWALL_CHANNELS,
  type LivewallChannel,
  type LivewallPlatform,
} from './livewall-meta';

export type LivewallCtaKind = 'download' | 'coming-soon';

export interface LivewallPlatformProbe {
  userAgent?: string | null;
  platform?: string | null;
  maxTouchPoints?: number | null;
}

export interface LivewallCtaCopy {
  kind: LivewallCtaKind;
  /** 界面展示的平台名；`other` 为 `null`（不展示平台标签）。 */
  platformLabel: string | null;
  title: string;
  description: string;
  actionLabel: string;
}

const PLATFORM_LABELS: Record<LivewallPlatform, string | null> = {
  macos: 'Mac',
  windows: 'Windows',
  other: null,
};

const MAC_PLATFORM_HINTS = /Mac OS X|Macintosh|macOS/i;
const WINDOWS_PLATFORM_HINTS = /Windows|Win32|Win64|WinCE/i;
/** 移动端与 ChromeOS 的明确特征，优先于 Mac 判定。 */
const NON_DESKTOP_HINTS = /iPhone|iPad|iPod|Android|Windows Phone|CrOS/i;
const NON_DESKTOP_PLATFORM = /^(iPhone|iPad|iPod|Android)/i;

/**
 * 判定当前平台。
 *
 * 两个必须挡住的陷阱：
 * 1. **iPhone / iPad 的 UA 里含有 `like Mac OS X`** —— 若不先排除，iPhone 会被判成 macOS。
 * 2. **iPadOS 13+ 会把 `platform` 报成 `MacIntel`** —— 触点数大于 1 的"Mac"一律判为 `other`，
 *    否则 iPad 上会出现一个点了装不上的 macOS 下载按钮。
 */
export function detectLivewallPlatform(probe: LivewallPlatformProbe): LivewallPlatform {
  const userAgent = probe.userAgent ?? '';
  const platform = probe.platform ?? '';
  const maxTouchPoints =
    typeof probe.maxTouchPoints === 'number' && Number.isFinite(probe.maxTouchPoints)
      ? probe.maxTouchPoints
      : 0;

  if (NON_DESKTOP_HINTS.test(userAgent) || NON_DESKTOP_PLATFORM.test(platform)) return 'other';

  const looksLikeMac =
    platform === 'MacIntel' ||
    platform === 'MacPPC' ||
    platform === 'Mac68K' ||
    MAC_PLATFORM_HINTS.test(userAgent);
  if (looksLikeMac) return maxTouchPoints > 1 ? 'other' : 'macos';

  if (platform.startsWith('Win') || WINDOWS_PLATFORM_HINTS.test(userAgent)) return 'windows';

  return 'other';
}

/** 薄封装 `navigator`，非浏览器环境（含单测的 Node 环境）下安全返回空探测值。 */
export function readLivewallPlatformProbe(): LivewallPlatformProbe {
  if (typeof navigator === 'undefined') return {};
  return {
    userAgent: navigator.userAgent ?? null,
    platform: navigator.platform ?? null,
    maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : null,
  };
}

/**
 * 有发布通道即「下载」，否则「开发中 / 暂不支持」。
 *
 * Windows 上线时**本函数无需改动** —— 只要 `LIVEWALL_CHANNELS` 里多一条记录。
 */
export function resolveLivewallCtaKind(
  platform: LivewallPlatform,
  channels: Partial<Record<LivewallPlatform, LivewallChannel>> = LIVEWALL_CHANNELS,
): LivewallCtaKind {
  return channels[platform] ? 'download' : 'coming-soon';
}

export function livewallCtaCopy(platform: LivewallPlatform): LivewallCtaCopy {
  const kind = resolveLivewallCtaKind(platform);
  const platformLabel = PLATFORM_LABELS[platform];

  if (kind === 'download') {
    return {
      kind,
      platformLabel,
      title: LIVEWALL_APP_NAME,
      description: '将视频设为系统壁纸，支持多屏适配与锁屏预览。',
      actionLabel: '免费下载',
    };
  }

  const isWindows = platform === 'windows';
  return {
    kind,
    platformLabel,
    title: LIVEWALL_APP_NAME,
    description: isWindows
      ? 'Windows 版正在开发中，敬请期待。'
      : '当前系统暂不支持，目前提供 macOS 版。',
    actionLabel: isWindows ? '开发中' : '暂不支持',
  };
}
