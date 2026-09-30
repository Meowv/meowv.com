import { describe, expect, it } from 'vitest';
import type { RenderedPage } from '../types/reader';
import { PageCache, appearanceRevisionFromKey, createPageCacheKey } from './PageCache';

function makePage(
  pageNumber: number,
  targetWidth: number,
  quality: RenderedPage['quality'],
  height = 1000,
): RenderedPage {
  // node 环境没有 canvas，PageCache 只读取 width/height 与 byteSize。
  const canvas = { width: targetWidth, height } as HTMLCanvasElement;
  return {
    pageNumber,
    canvas,
    width: targetWidth,
    height,
    targetWidth,
    quality,
    byteSize: targetWidth * height * 4,
    dispose: () => undefined,
  };
}

function put(
  cache: PageCache,
  pageNumber: number,
  targetWidth: number,
  quality: RenderedPage['quality'],
  appearanceRevision = 0,
): string {
  const key = createPageCacheKey(pageNumber, targetWidth, quality, appearanceRevision);
  cache.set(key, makePage(pageNumber, targetWidth, quality));
  return key;
}

describe('createPageCacheKey / appearanceRevisionFromKey', () => {
  it('键格式与版本解析一致', () => {
    const key = createPageCacheKey(7, 896.4, 'reading', 3);
    expect(key).toBe('3:7:896:reading');
    expect(appearanceRevisionFromKey(key)).toBe(3);
  });

  it('无法解析时回落到 0', () => {
    expect(appearanceRevisionFromKey('not-a-key')).toBe(0);
  });
});

describe('PageCache.getBest', () => {
  it('不传版本时返回同页最宽的位图', () => {
    const cache = new PageCache();
    put(cache, 5, 640, 'reading');
    put(cache, 5, 1280, 'reading');
    expect(cache.getBest(5, ['reading'])?.targetWidth).toBe(1280);
  });

  it('按质量顺序优先匹配，且同质量取最宽', () => {
    const cache = new PageCache();
    put(cache, 5, 640, 'reading');
    put(cache, 5, 1024, 'preview');
    expect(cache.getBest(5)?.targetWidth).toBe(640);
    expect(cache.getBest(5)?.quality).toBe('reading');
    expect(cache.getBest(5, ['preview', 'reading'])?.targetWidth).toBe(1024);
  });

  it('指定外观版本时忽略其他版本的位图', () => {
    const cache = new PageCache();
    put(cache, 5, 1280, 'reading', 0);
    put(cache, 5, 640, 'reading', 1);
    expect(cache.getBest(5, ['reading'], 1)?.targetWidth).toBe(640);
    expect(cache.getBest(5, ['reading'], 0)?.targetWidth).toBe(1280);
  });

  it('目标版本没有任何位图时返回 undefined，而不是退回旧版本', () => {
    const cache = new PageCache();
    put(cache, 5, 1280, 'reading', 0);
    expect(cache.getBest(5, ['reading'], 9)).toBeUndefined();
  });

  it('只匹配目标页号', () => {
    const cache = new PageCache();
    put(cache, 5, 1280, 'reading', 1);
    expect(cache.getBest(6, ['reading'], 1)).toBeUndefined();
  });

  it('命中后把该项触到 LRU 队尾', () => {
    const cache = new PageCache({ maxEntries: 3 });
    put(cache, 1, 640, 'reading');
    put(cache, 2, 640, 'reading');
    put(cache, 3, 640, 'reading');
    expect(cache.getBest(1, ['reading'])?.pageNumber).toBe(1);
    // 再塞一页会按 LRU 淘汰最旧项：刚被 getBest 触碰过的第 1 页应当存活。
    put(cache, 4, 640, 'reading');
    expect(cache.has(createPageCacheKey(1, 640, 'reading'))).toBe(true);
    expect(cache.has(createPageCacheKey(2, 640, 'reading'))).toBe(false);
  });
});

describe('PageCache 页面持有', () => {
  function disposablePage(pageNumber: number): RenderedPage {
    const page = makePage(pageNumber, 10, 'reading', 10);
    page.dispose = () => {
      page.canvas.width = 0;
      page.canvas.height = 0;
    };
    return page;
  }

  it('淘汰和同键替换时保留仍在展示的 Canvas，最后释放持有时才销毁', () => {
    const cache = new PageCache({ maxBytes: 400, maxEntries: 1 });
    const first = disposablePage(1);
    cache.set('page', first);
    const visible = cache.acquire(first);
    const second = disposablePage(2);
    cache.set('page', second);

    expect(cache.get('page')).toBe(second);
    expect(first.canvas.width).toBe(10);
    visible.release();
    visible.release();
    expect(first.canvas.width).toBe(0);
    expect(second.canvas.width).toBe(10);
  });

  it('超过预算的页面仍能交给当前画面使用，释放后销毁', () => {
    const cache = new PageCache({ maxBytes: 100 });
    const page = disposablePage(1);
    const visible = cache.acquire(page);
    expect(cache.set('large', page)).toBe(false);
    expect(page.canvas.width).toBe(10);
    expect(cache.has('large')).toBe(false);
    visible.release();
    expect(page.canvas.width).toBe(0);
  });

  it('清空缓存时延迟销毁被翻页纸张持有的页面', () => {
    const cache = new PageCache({ maxBytes: 400 });
    const page = disposablePage(1);
    cache.set('page', page);
    const turning = cache.acquire(page);
    cache.clear();
    expect(page.canvas.width).toBe(10);
    turning.release();
    expect(page.canvas.width).toBe(0);
  });

  it('容量淘汰不能清空仍被静态书页使用的画布', () => {
    const cache = new PageCache({ maxBytes: 400, maxEntries: 1 });
    const current = disposablePage(1);
    cache.set('current', current);
    const visible = cache.acquire(current);
    cache.set('next', disposablePage(2));
    expect(cache.has('current')).toBe(false);
    expect(current.canvas.width).toBe(10);
    visible.release();
    expect(current.canvas.width).toBe(0);
  });
});
