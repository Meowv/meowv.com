import { describe, expect, it } from 'vitest';
import {
  defaultSpecialSymbolCategory,
  getSpecialSymbolCategoryFromHash,
  loadSpecialSymbolCategory,
  specialSymbolCategories,
  specialSymbolCategoryIds,
} from '../categories';

describe('特殊符号分类', () => {
  it('按固定顺序暴露全部分类，并以 Popular 为默认项', () => {
    expect(specialSymbolCategoryIds).toEqual([
      'Popular',
      'Letters',
      'Punctuation',
      'Math',
      'Numbers',
      'Currency',
      'Symbols',
      'Hieroglyphs',
      'Arrows',
      'Emoji',
    ]);
    expect(defaultSpecialSymbolCategory).toBe('Popular');
    expect(specialSymbolCategories.map((category) => category.name)).toEqual(
      specialSymbolCategoryIds,
    );
    expect(getSpecialSymbolCategoryFromHash('#Popular')).toBe('Popular');
    expect(getSpecialSymbolCategoryFromHash('#Emoji')).toBe('Emoji');
    expect(getSpecialSymbolCategoryFromHash('#Unknown')).toBe('Popular');
    expect(getSpecialSymbolCategoryFromHash('')).toBe('Popular');
  });

  it('每个分类均可按需加载，并保留 CopyChar 元数据', async () => {
    const datasets = await Promise.all(specialSymbolCategoryIds.map(loadSpecialSymbolCategory));

    for (const characters of datasets) {
      expect(characters.length).toBeGreaterThan(0);
      expect(characters[0]).toMatchObject({
        value: expect.any(String),
        name: expect.any(String),
        unicode: expect.stringMatching(/^U\+/),
        html: expect.any(String),
      });
    }
  });
});
