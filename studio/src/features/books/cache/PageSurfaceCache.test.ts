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
});
