import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVEWALL_RELEASE, LIVEWALL_CHANNELS } from '../livewall-meta';
import {
  detectLivewallPlatform,
  livewallCtaCopy,
  resolveLivewallCtaKind,
} from '../livewall-platform';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const LINUX_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('detectLivewallPlatform', () => {
  it('识别 macOS', () => {
    expect(
      detectLivewallPlatform({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 }),
    ).toBe('macos');
  });

  it('识别 Windows', () => {
    expect(
      detectLivewallPlatform({ userAgent: WINDOWS_UA, platform: 'Win32', maxTouchPoints: 0 }),
    ).toBe('windows');
    expect(detectLivewallPlatform({ platform: 'Win32' })).toBe('windows');
  });

  it('把 iPadOS 伪装的 MacIntel 判为非 Mac（触点数大于 1）', () => {
    expect(detectLivewallPlatform({ platform: 'MacIntel', maxTouchPoints: 5 })).toBe('other');
  });

  it('不把含 "like Mac OS X" 的 iOS UA 判成 macOS', () => {
    expect(detectLivewallPlatform({ userAgent: IPHONE_UA })).toBe('other');
    expect(detectLivewallPlatform({ userAgent: IPHONE_UA, platform: 'iPhone' })).toBe('other');
    expect(detectLivewallPlatform({ userAgent: IPAD_UA, platform: 'iPad' })).toBe('other');
  });

  it.each([
    ['Android', { userAgent: ANDROID_UA, platform: 'Linux armv8l' }],
    ['Linux 桌面', { userAgent: LINUX_UA, platform: 'Linux x86_64' }],
    ['空探测值', {}],
    ['全 null', { userAgent: null, platform: null, maxTouchPoints: null }],
    ['只有 iPhone platform', { platform: 'iPhone' }],
  ])('%s 判为 other', (_label, probe) => {
    expect(detectLivewallPlatform(probe)).toBe('other');
  });
});

describe('resolveLivewallCtaKind', () => {
  it('有发布通道的平台可下载', () => {
    expect(resolveLivewallCtaKind('macos')).toBe('download');
  });

  it('没有发布通道的平台显示开发中', () => {
    expect(resolveLivewallCtaKind('windows')).toBe('coming-soon');
    expect(resolveLivewallCtaKind('other')).toBe('coming-soon');
  });

  it('通道表为空时全部降级为开发中', () => {
    expect(resolveLivewallCtaKind('macos', {})).toBe('coming-soon');
    expect(resolveLivewallCtaKind('windows', LIVEWALL_CHANNELS)).toBe('coming-soon');
  });

  it('Windows 通道补上后即自动变为可下载（无需改判定逻辑）', () => {
    expect(
      resolveLivewallCtaKind('windows', {
        windows: {
          platform: 'windows',
          feedPath: 'data/livewall/version.windows.json',
          release: DEFAULT_LIVEWALL_RELEASE,
        },
      }),
    ).toBe('download');
  });
});

describe('livewallCtaCopy', () => {
  it('macOS 提供下载文案，且描述里不重复版本与系统要求（由展示模型单独渲染）', () => {
    const copy = livewallCtaCopy('macos');
    expect(copy.kind).toBe('download');
    expect(copy.platformLabel).toBe('Mac');
    expect(copy.actionLabel).toBe('免费下载');
    // 只断言不变量，不锁具体措辞 —— 文案会随产品迭代调整。
    expect(copy.description.length).toBeGreaterThan(0);
    expect(copy.description).not.toContain('需要 macOS');
    expect(copy.description).not.toContain('及以上');
    expect(copy.description).not.toContain('undefined');
    expect(copy.description).not.toMatch(/\d+\.\d+/);
  });

  it('Windows 显示开发中，且文案不含"下载"', () => {
    const copy = livewallCtaCopy('windows');
    expect(copy.kind).toBe('coming-soon');
    expect(copy.platformLabel).toBe('Windows');
    expect(copy.actionLabel).toBe('开发中');
    expect(copy.actionLabel).not.toContain('下载');
    expect(copy.description).toContain('开发中');
  });

  it('未知平台提示暂不支持且不展示平台标签', () => {
    const copy = livewallCtaCopy('other');
    expect(copy.platformLabel).toBeNull();
    expect(copy.actionLabel).toBe('暂不支持');
    expect(copy.description).toContain('macOS');
  });
});
