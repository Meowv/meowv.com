import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChapterSnapshotCache,
  createChapterSnapshot,
  snapshotSvg,
  snapshotHasImages,
  renderChapterSnapshot,
} from './chapter-snapshot';

const snapshot = (size: number) => ({ prefix: 'x'.repeat(size), suffix: '' });

afterEach(() => vi.unstubAllGlobals());

describe('章节快照解码取消', () => {
  function setup(decode: () => Promise<void>) {
    const drawImage = vi.fn();
    const canvases: Array<{ width: number; height: number; getContext: () => object }> = [];
    const images: Array<{ removeAttribute: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        src = '';
        removeAttribute = vi.fn();
        decode = decode;
        constructor() {
          images.push(this);
        }
      },
    );
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = {
          width: 300,
          height: 150,
          getContext: () => ({ fillRect: vi.fn(), drawImage }),
        };
        canvases.push(canvas);
        return canvas;
      },
    });
    const render = (signal?: AbortSignal) =>
      renderChapterSnapshot(snapshot(1), 0, { width: 700, height: 1000 }, 700, '#fff', signal);
    return { render, canvases, images, drawImage };
  }

  it('移除 src 后解码始终不结束时，取消仍释放画布并让串行下一页继续', async () => {
    const decode = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValue(undefined);
    const { render, canvases, images, drawImage } = setup(decode);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const first = render(controller.signal);
    const next = first.catch(() => undefined).then(() => render());
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(next).resolves.toMatchObject({ width: 700, height: 1000 });
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    '取消后解码迟到 %s 不再绘制或影响下一页',
    async (result) => {
      let resolveDecode!: () => void;
      let rejectDecode!: (error: Error) => void;
      const decode = vi.fn<() => Promise<void>>().mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveDecode = resolve;
            rejectDecode = reject;
          }),
      );
      decode.mockResolvedValue(undefined);
      const { render, canvases, drawImage } = setup(decode);
      const controller = new AbortController();
      const pending = render(controller.signal);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      if (result === 'resolve') resolveDecode();
      else rejectDecode(new Error('迟到的解码错误'));
      await render();
      expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
      expect(drawImage).toHaveBeenCalledTimes(1);
    },
  );
});

describe('ChapterSnapshotCache', () => {
  it('按 UTF-16 字节限制总量，并淘汰最久未使用的章节', () => {
    const cache = new ChapterSnapshotCache(12);
    const first = snapshot(3);
    cache.set('first', first);
    cache.set('second', snapshot(3));
    expect(cache.get('first')).toBe(first);
    cache.set('third', snapshot(3));
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBe(first);
    expect(cache.byteSize).toBe(12);
  });

  it('超预算的章节不挤掉其他可复用快照', () => {
    const cache = new ChapterSnapshotCache(8);
    cache.set('small', snapshot(3));
    cache.set('large', snapshot(5));
    expect(cache.size).toBe(1);
    expect(cache.get('small')).toBeDefined();
    expect(cache.get('large')).toBeUndefined();
  });

  it('替换、删除和失效时准确释放预算', () => {
    const cache = new ChapterSnapshotCache(20);
    cache.set('section', snapshot(8));
    cache.set('section', snapshot(3));
    expect(cache.byteSize).toBe(6);
    cache.delete('section');
    cache.delete('missing');
    expect(cache.byteSize).toBe(0);
    cache.set('another', snapshot(4));
    cache.clear();
    expect(cache.byteSize).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('尺寸档位、外观版本与章节的不同键互不覆盖', () => {
    const cache = new ChapterSnapshotCache(100);
    for (const key of ['1:0:640', '1:0:1280', '1:1:1280', '2:1:1280']) {
      cache.set(key, snapshot(1));
    }
    expect(cache.size).toBe(4);
  });
});

describe('章节 SVG 快照', () => {
  it('只插入页位移，保留文本和原有 transform 等其他内容', () => {
    const value = {
      prefix: '<svg style="--books-page-offset:',
      suffix: '"><text>translateX(0)</text></svg>',
    };
    expect(snapshotSvg(value, -1400)).toBe(
      '<svg style="--books-page-offset:-1400px"><text>translateX(0)</text></svg>',
    );
  });

  it.each([NaN, Infinity, -Infinity])('拒绝非法位移 %s', (value) => {
    expect(() => snapshotSvg(snapshot(1), value)).toThrow(RangeError);
  });

  it('拒绝非 SVG 和仍依赖章节 blob URL 的快照', () => {
    expect(createChapterSnapshot('data:image/png;base64,a')).toBeNull();
    expect(createChapterSnapshot('data:image/svg+xml,')).toBeNull();
    expect(createChapterSnapshot('data:image/svg+xml,%E0')).toBeNull();
    expect(
      createChapterSnapshot(
        'data:image/svg+xml,' + encodeURIComponent('<svg><image href="blob:test"/></svg>'),
      ),
    ).toBeNull();
  });
});

it('仅无图片的快照可跨分辨率档位复用', () => {
  expect(snapshotHasImages({ prefix: '<svg><text>正文</text>', suffix: '</svg>' })).toBe(false);
  expect(snapshotHasImages({ prefix: '<img src="data:image/png;base64,a"/>', suffix: '' })).toBe(
    true,
  );
  expect(
    snapshotHasImages({
      prefix: '<style>background:url(data:image/png;base64,a)</style>',
      suffix: '',
    }),
  ).toBe(true);
  expect(snapshotHasImages({ prefix: '', suffix: '<image href="data:image/svg+xml,a"/>' })).toBe(
    true,
  );
});
