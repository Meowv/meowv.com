import { describe, expect, it } from 'vitest';
import {
  LIVEWALL_PROMO_DISMISS_KEY,
  readLivewallPromoDismissed,
  resolveLivewallPromoVisibility,
  writeLivewallPromoDismissed,
} from '../livewall-promo';

describe('resolveLivewallPromoVisibility', () => {
  it('电脑视图且未关闭时右下角浮层与灯箱入口都显示', () => {
    expect(resolveLivewallPromoVisibility({ device: 'desktop', dismissed: false })).toEqual({
      popup: true,
      lightboxCta: true,
    });
  });

  it('关闭只影响右下角浮层，灯箱入口保留', () => {
    expect(resolveLivewallPromoVisibility({ device: 'desktop', dismissed: true })).toEqual({
      popup: false,
      lightboxCta: true,
    });
  });

  it.each([true, false])('手机视图下两个推广位都不显示（dismissed=%s）', (dismissed) => {
    expect(resolveLivewallPromoVisibility({ device: 'mobile', dismissed })).toEqual({
      popup: false,
      lightboxCta: false,
    });
  });
});

describe('关闭态存储键', () => {
  it('键名稳定，避免改键导致用户关闭状态丢失', () => {
    expect(LIVEWALL_PROMO_DISMISS_KEY).toBe(
      'meowv-studio:preferences:v1:wallpapers-app-promo-dismissed',
    );
  });
});

describe('readLivewallPromoDismissed', () => {
  it('读取已关闭标记', () => {
    const storage = {
      getItem: (key: string) => (key === LIVEWALL_PROMO_DISMISS_KEY ? '1' : null),
    };
    expect(readLivewallPromoDismissed(storage)).toBe(true);
  });

  it.each([
    ['无记录', { getItem: () => null }],
    ['记录为其他值', { getItem: () => '0' }],
  ])('%s 时视为未关闭', (_label, storage) => {
    expect(readLivewallPromoDismissed(storage)).toBe(false);
  });

  it('存储不可用（读取抛错）时视为未关闭且不抛错', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => readLivewallPromoDismissed(storage)).not.toThrow();
    expect(readLivewallPromoDismissed(storage)).toBe(false);
  });

  it.each([undefined, null])('storage 为 %s 时视为未关闭', (storage) => {
    expect(readLivewallPromoDismissed(storage)).toBe(false);
  });
});

describe('writeLivewallPromoDismissed', () => {
  function createStorage(): {
    storage: Pick<Storage, 'setItem' | 'removeItem'>;
    data: Map<string, string>;
  } {
    const data = new Map<string, string>();
    return {
      data,
      storage: {
        setItem: (key: string, value: string) => {
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
      },
    };
  }

  it('关闭时写入标记', () => {
    const { storage, data } = createStorage();
    writeLivewallPromoDismissed(storage, true);
    expect(data.get(LIVEWALL_PROMO_DISMISS_KEY)).toBe('1');
  });

  it('恢复时移除标记', () => {
    const { storage, data } = createStorage();
    data.set(LIVEWALL_PROMO_DISMISS_KEY, '1');
    writeLivewallPromoDismissed(storage, false);
    expect(data.has(LIVEWALL_PROMO_DISMISS_KEY)).toBe(false);
  });

  it('写入失败时静默忽略', () => {
    const storage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => writeLivewallPromoDismissed(storage, true)).not.toThrow();
    expect(() => writeLivewallPromoDismissed(storage, false)).not.toThrow();
  });

  it.each([undefined, null])('storage 为 %s 时不做任何事', (storage) => {
    expect(() => writeLivewallPromoDismissed(storage, true)).not.toThrow();
  });
});
