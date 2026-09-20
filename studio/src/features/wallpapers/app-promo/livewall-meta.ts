/**
 * 桌面动态壁纸 App（livewall）的元信息与发布信息归一化。
 *
 * 这里是"线上数据不可信"的唯一收口：`version.json` 来自 CDN，字段可能缺失或类型错误，
 * 一律经 `normalizeLivewallRelease` 收敛后再交给 UI。
 *
 * 与 Swift 侧 `LiveWallCore/UpdateFeed.swift` 的约定保持一致：必填字段任一非法即整体退回兜底，
 * 不留半截数据。
 */

export type LivewallPlatform = 'macos' | 'windows' | 'other';

/** 发布信息的来源：远端 `version.json` 或本地兜底常量。 */
export type LivewallFeedSource = 'remote' | 'fallback';

export interface LivewallRelease {
  version: string;
  build: number;
  notes: string;
  sizeBytes: number | null;
  sha256: string | null;
  fileURL: string;
  minOSVersion: string | null;
}

/**
 * 一个平台的发布通道。
 *
 * **新增平台（例如 Windows 版上线）只需在 `LIVEWALL_CHANNELS` 里追加一条记录**，
 * 平台判定、CTA 形态与文案逻辑均无需改动。
 *
 * 这里刻意**不放平台显示名** —— 那个唯一来源是 `livewall-platform.ts` 的 `PLATFORM_LABELS`，
 * 因为「Windows 未发布」时也要能显示 `Windows` 这个标签（此时并没有 channel）。
 */
export interface LivewallChannel {
  platform: LivewallPlatform;
  /** 相对于 `import.meta.env.BASE_URL` 的发布信息路径。 */
  feedPath: string;
  /** 远端不可用时的静态兜底。 */
  release: LivewallRelease;
}

/** 推广文案里展示的产品名。注意与 App 的界面显示名（「动态壁纸」）不同。 */
export const LIVEWALL_APP_NAME = 'LiveWall';

/** 兜底常量必须与 `livewall/make-dmg.sh` 产出的版本保持一致，发版时同步更新。 */
export const LIVEWALL_FALLBACK_VERSION = '0.1.0';
export const LIVEWALL_FALLBACK_BUILD = 1;
export const LIVEWALL_FALLBACK_MIN_OS = '13.0';
export const LIVEWALL_FALLBACK_SIZE_BYTES = 3_149_824;

/** 安装包与发布信息的固定落点，与 `make-dmg.sh` 里硬编码的域名一致。 */
const LIVEWALL_RELEASE_BASE_URL = 'https://studio.meowv.com/data/livewall/';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** 安装包文件名，与 `livewall/make-dmg.sh` 的 `LiveWall-<版本>.dmg` 命名保持一致。 */
export function livewallDownloadFileName(version: string): string {
  return `LiveWall-${version}.dmg`;
}

/**
 * 兜底下载地址。
 *
 * 刻意由版本号派生而不是手写完整 URL —— 发版时只需 bump `LIVEWALL_FALLBACK_VERSION`，
 * 不会出现"版本号改了但兜底 URL 还指向旧包"的漂移。
 */
export function livewallFallbackFileURL(version: string = LIVEWALL_FALLBACK_VERSION): string {
  return `${LIVEWALL_RELEASE_BASE_URL}${livewallDownloadFileName(version)}`;
}

/** 拼接发布信息地址。`baseUrl` 即 `import.meta.env.BASE_URL`，恒以 `/` 结尾。 */
export function livewallFeedUrl(baseUrl: string, channel: LivewallChannel): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${channel.feedPath}`;
}

/** 只接受 https 地址，挡掉 `http:` 与 `javascript:` 之类的注入面。 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 只接受正整数字节数；0、负数、`NaN`、非数字一律视为未知。 */
function readSizeBytes(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function formatByteSize(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return null;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  // 字节数不带小数（`512 B`），更大的单位保留一位（`3.0 MB`）。
  const rounded = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

export const DEFAULT_LIVEWALL_RELEASE: LivewallRelease = {
  version: LIVEWALL_FALLBACK_VERSION,
  build: LIVEWALL_FALLBACK_BUILD,
  notes: '',
  sizeBytes: LIVEWALL_FALLBACK_SIZE_BYTES,
  sha256: null,
  minOSVersion: LIVEWALL_FALLBACK_MIN_OS,
  fileURL: livewallFallbackFileURL(),
};

/**
 * 把远端 `version.json` 归一化成可信的 `LivewallRelease`。
 *
 * 必填 `version`（非空字符串）、`build`（正整数）、`fileURL`（https）任一非法 → 整体退回 `fallback`；
 * 可选 `notes` / `sha256` / `minOSVersion` / `sizeBytes` 缺失 → 字段级兜底。
 */
export function normalizeLivewallRelease(
  raw: unknown,
  fallback: LivewallRelease = DEFAULT_LIVEWALL_RELEASE,
): LivewallRelease {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const value = raw as Record<string, unknown>;

  const version = readOptionalString(value.version);
  const build = value.build;
  if (!version || typeof build !== 'number' || !Number.isInteger(build) || build <= 0) {
    return fallback;
  }
  if (!isHttpsUrl(value.fileURL)) return fallback;

  return {
    version,
    build,
    notes: typeof value.notes === 'string' ? value.notes : '',
    sizeBytes: readSizeBytes(value.sizeBytes),
    sha256: readOptionalString(value.sha256),
    fileURL: value.fileURL,
    minOSVersion: readOptionalString(value.minOSVersion),
  };
}

/**
 * 各平台的发布通道。
 *
 * Windows 版上线时在此追加（平台显示名已在 `PLATFORM_LABELS` 里，这里不用重复）：
 * ```ts
 * windows: {
 *   platform: 'windows',
 *   feedPath: 'data/livewall/version.windows.json',
 *   release: { ... },
 * }
 * ```
 */
export const LIVEWALL_CHANNELS: Partial<Record<LivewallPlatform, LivewallChannel>> = {
  macos: {
    platform: 'macos',
    feedPath: 'data/livewall/version.json',
    release: DEFAULT_LIVEWALL_RELEASE,
  },
};
