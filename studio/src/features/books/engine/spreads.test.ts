import { describe, expect, it } from 'vitest';
import { getPrimaryPageForSpread, getSpread, getSpreadIndexForPage } from './spreads';

describe('book spreads', () => {
  it('keeps the first logical page on the right and preserves later odd pages', () => {
    expect(getSpread(0, 9)).toEqual({ index: 0, leftPage: null, rightPage: 1 });
    expect(getSpread(2, 9)).toEqual({ index: 2, leftPage: 4, rightPage: 5 });
    expect(getSpreadIndexForPage(5, 9)).toBe(2);
    expect(getPrimaryPageForSpread(2, 9)).toBe(4);
  });
});
