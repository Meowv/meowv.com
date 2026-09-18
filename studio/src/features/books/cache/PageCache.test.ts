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
