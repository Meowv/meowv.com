import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVEWALL_RELEASE,
  LIVEWALL_CHANNELS,
  LIVEWALL_FALLBACK_BUILD,
  LIVEWALL_FALLBACK_MIN_OS,
  LIVEWALL_FALLBACK_SIZE_BYTES,
  LIVEWALL_FALLBACK_VERSION,
  formatByteSize,
  isHttpsUrl,
  livewallDownloadFileName,
  livewallFallbackFileURL,
  livewallFeedUrl,
  normalizeLivewallRelease,
  type LivewallChannel,
} from '../livewall-meta';

const VALID_PAYLOAD = {
  version: '0.2.0',
  build: 2,
  notes: '修复多屏问题',
  sizeBytes: 4_194_304,
  sha256: 'a'.repeat(64),
  fileURL: 'https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg',
  minOSVersion: '13.0',
};

describe('normalizeLivewallRelease', () => {
  it('保留完整的合法发布信息', () => {
    expect(normalizeLivewallRelease(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD);
  });

  it.each(['version', 'build', 'fileURL'])('缺少必填字段 %s 时整体退回兜底', (field) => {
    const payload: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete payload[field];
    expect(normalizeLivewallRelease(payload)).toBe(DEFAULT_LIVEWALL_RELEASE);
  });

  it.each([
    ['字符串版本号', '1'],
    ['零', 0],
    ['负数', -1],
    ['小数', 1.5],
  ])('build 为%s时整体退回兜底', (_label, build) => {
    expect(normalizeLivewallRelease({ ...VALID_PAYLOAD, build })).toBe(DEFAULT_LIVEWALL_RELEASE);
  });

  it.each(['http://studio.meowv.com/x.dmg', 'javascript:alert(1)', '', 42])(
    'fileURL 为 %s 时整体退回兜底（只认 https）',
    (fileURL) => {
      expect(normalizeLivewallRelease({ ...VALID_PAYLOAD, fileURL })).toBe(
        DEFAULT_LIVEWALL_RELEASE,
      );
    },
  );

  it('可选字段缺失时只做字段级兜底，保留远端版本与地址', () => {
    expect(
      normalizeLivewallRelease({
        version: '0.2.0',
        build: 2,
        fileURL: 'https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg',
      }),
    ).toEqual({
      version: '0.2.0',
      build: 2,
      notes: '',
      sizeBytes: null,
      sha256: null,
      fileURL: 'https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg',
      minOSVersion: null,
    });
  });

  it.each([null, undefined, [], 'x', 42, true])('原始值 %s 不是对象时退回兜底', (raw) => {
    expect(normalizeLivewallRelease(raw)).toBe(DEFAULT_LIVEWALL_RELEASE);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1024', null])(
    'sizeBytes 为 %s 时视为未知',
    (sizeBytes) => {
      expect(normalizeLivewallRelease({ ...VALID_PAYLOAD, sizeBytes }).sizeBytes).toBeNull();
    },
  );

  it('接受显式兜底参数', () => {
    const custom = { ...DEFAULT_LIVEWALL_RELEASE, version: '9.9.9' };
    expect(normalizeLivewallRelease({}, custom)).toBe(custom);
  });
});

describe('formatByteSize', () => {
  it.each([
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1_048_576, '1.0 MB'],
    [3_149_824, '3.0 MB'],
    [1_073_741_824, '1.0 GB'],
  ])('把 %i 格式化成 %s', (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected);
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '把无效值 %s 格式化成 null',
    (bytes) => {
      expect(formatByteSize(bytes)).toBeNull();
    },
  );
});

describe('isHttpsUrl', () => {
  it('只接受 https 字符串', () => {
    expect(isHttpsUrl('https://a.b/c.dmg')).toBe(true);
    expect(isHttpsUrl('http://a.b/c.dmg')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
    expect(isHttpsUrl(42)).toBe(false);
  });
});

describe('发布地址构造', () => {
  it('派生安装包文件名', () => {
    expect(livewallDownloadFileName('0.2.0')).toBe('LiveWall-0.2.0.dmg');
  });

  it('兜底地址由版本号派生，不会与版本漂移', () => {
    expect(livewallFallbackFileURL('0.2.0')).toBe(
      'https://studio.meowv.com/data/livewall/LiveWall-0.2.0.dmg',
    );
  });

  it('拼接发布信息地址并容错 baseUrl 结尾斜杠', () => {
    const channel: LivewallChannel = {
      platform: 'macos',
      feedPath: 'data/livewall/version.json',
      release: DEFAULT_LIVEWALL_RELEASE,
    };
    expect(livewallFeedUrl('/', channel)).toBe('/data/livewall/version.json');
    expect(livewallFeedUrl('/studio/', channel)).toBe('/studio/data/livewall/version.json');
    expect(livewallFeedUrl('/studio', channel)).toBe('/studio/data/livewall/version.json');
  });
});

describe('兜底常量', () => {
  it('Mac 通道的兜底版本与地址自洽', () => {
    const release = LIVEWALL_CHANNELS.macos?.release;
    expect(release).toBeDefined();
    expect(release?.version).toBe(LIVEWALL_FALLBACK_VERSION);
    expect(release?.build).toBe(LIVEWALL_FALLBACK_BUILD);
    expect(release?.minOSVersion).toBe(LIVEWALL_FALLBACK_MIN_OS);
    expect(release?.sizeBytes).toBe(LIVEWALL_FALLBACK_SIZE_BYTES);
    expect(release?.fileURL.endsWith(`LiveWall-${LIVEWALL_FALLBACK_VERSION}.dmg`)).toBe(true);
    expect(release?.fileURL).toBe(livewallFallbackFileURL());
  });
});
