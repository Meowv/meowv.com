import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_LAYOUT } from './publication/defaults';
import { themeColors } from './reader-theme';
import type { PageTheme } from './types/reader';

const THEMES: readonly PageTheme[] = ['paper', 'warm', 'night'];

describe('themeColors', () => {
  it('三个主题都有取值，且纸色两两不同', () => {
    const backgrounds = THEMES.map((theme) => themeColors(theme).background);
    expect(backgrounds.every((value) => /^#[0-9a-f]{6}$/.test(value))).toBe(true);
    expect(new Set(backgrounds).size).toBe(THEMES.length);
  });

  it('纸色与字色的明度方向一致：越暗的纸配越亮的字', () => {
    const luminance = (hex: string): number => {
      const n = Number.parseInt(hex.slice(1), 16);
      return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
    };
    const paper = themeColors('paper');
    const warm = themeColors('warm');
    const night = themeColors('night');

    expect(luminance(paper.background)).toBeGreaterThan(luminance(warm.background));
    expect(luminance(warm.background)).toBeGreaterThan(luminance(night.background));
    expect(luminance(night.foreground)).toBeGreaterThan(luminance(night.background));
    expect(luminance(paper.foreground)).toBeLessThan(luminance(paper.background));
  });

  it('默认阅读主题在调色板里有对应取值（默认主题被改名/删除时会失败）', () => {
    const colors = themeColors(DEFAULT_READER_LAYOUT.theme);
    expect(colors).toBeDefined();
    expect(colors.background).not.toBe(themeColors('night').background);
  });

  it('未知主题回落到暖纸，不会返回 undefined', () => {
    expect(themeColors('sepia' as PageTheme)).toEqual(themeColors('warm'));
  });
});
