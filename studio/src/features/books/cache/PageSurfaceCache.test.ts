import { describe, expect, it } from 'vitest';
import { PageSurfaceCache } from './PageSurfaceCache';

function surface(width = 10, height = 10): { width: number; height: number } {
  return { width, height };
}

describe('PageSurfaceCache', () => {
  it('evicts the least-recently-used unreferenced surface without allocations', () => {
    const cache = new PageSurfaceCache(800, 1);
    const firstSurface = surface();
    const secondSurface = surface();
    const thirdSurface = surface();
    const first = cache.warm(firstSurface);
    const second = cache.warm(secondSurface);
    const third = cache.warm(thirdSurface);
    cache.prune();

    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(800);
    expect(cache.acquire(secondSurface)).toBe(second);
    expect(cache.acquire(thirdSurface)).toBe(third);
    expect(cache.acquire(firstSurface)).not.toBe(first);
    expect(cache.refCount(first)).toBe(0);
    cache.clear();
  });

  it('never evicts a surface that is still referenced', () => {
    const cache = new PageSurfaceCache(800, 1);
    const protectedTexture = cache.acquire(surface());
    cache.warm(surface());
    cache.warm(surface());
    cache.prune();

    expect(cache.refCount(protectedTexture)).toBe(1);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(800);
    cache.release(protectedTexture);
    cache.clear();
  });

  it('上下文恢复时重新标记现存纹理上传', () => {
    const cache = new PageSurfaceCache(800, 1);
    const texture = cache.acquire(surface());
    const before = texture.version;
    cache.refresh();
    expect(texture.version).toBe(before + 1);
    cache.release(texture);
    cache.clear();
  });

  it('拒绝已经被释放的画布，并清除无引用的旧纹理', () => {
    const cache = new PageSurfaceCache(800, 1);
    const source = surface();
    const texture = cache.acquire(source);
    cache.release(texture);
    source.width = 0;
    cache.refresh();
    expect(cache.size).toBe(0);
    expect(() => cache.acquire(source)).toThrow('书页纹理来源已失效');
  });
});
