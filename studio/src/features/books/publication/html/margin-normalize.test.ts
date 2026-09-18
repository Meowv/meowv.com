import { describe, expect, it } from 'vitest';
import {
  neutralizeNegativeVerticalMargins,
  type MarginStyleDeclaration,
} from './margin-normalize';

/** 用 Map 兜一个最小实现，避免测试依赖 DOM。 */
function declaration(entries: Record<string, string>): {
  style: MarginStyleDeclaration;
  read: () => Record<string, string>;
} {
  const store = new Map(Object.entries(entries));
  return {
    style: {
      getPropertyValue: (property) => store.get(property) ?? '',
      setProperty: (property, value) => void store.set(property, value),
    },
    read: () => Object.fromEntries(store),
  };
}

describe('neutralizeNegativeVerticalMargins', () => {
  it('只归零负的那一侧，正值侧必须保留', () => {
    // 三体 EPUB 的实际取值：UA 默认 margin-top 为正，书内 margin-bottom 为负。
    const { style, read } = declaration({ 'margin-top': '1em', 'margin-bottom': '-0.8em' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()['margin-top']).toBe('1em');
    expect(read()['margin-bottom']).toBe('0');
  });

  it('两侧都为负时都要归零', () => {
    const { style, read } = declaration({ 'margin-top': '-1em', 'margin-bottom': '-0.8em' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()).toMatchObject({ 'margin-top': '0', 'margin-bottom': '0' });
  });

  it('两侧都非负时不改动', () => {
    const { style, read } = declaration({ 'margin-top': '1em', 'margin-bottom': '0px' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()).toMatchObject({ 'margin-top': '1em', 'margin-bottom': '0px' });
  });

  it('处理逻辑属性 margin-block-start / margin-block-end', () => {
    const { style, read } = declaration({
      'margin-block-start': '-0.5em',
      'margin-block-end': '2em',
    });
    neutralizeNegativeVerticalMargins(style);
    expect(read()).toMatchObject({ 'margin-block-start': '0', 'margin-block-end': '2em' });
  });

  it('处理 margin 简写：1 值 / 2 值 / 3 值 / 4 值', () => {
    const one = declaration({ margin: '-1em' });
    neutralizeNegativeVerticalMargins(one.style);
    expect(one.read().margin).toBe('0');

    // `a b` → 上下 a、左右 b：只有上下位需要归零，左右位必须保留。
    const two = declaration({ margin: '-0.8em 1em' });
    neutralizeNegativeVerticalMargins(two.style);
    expect(two.read().margin).toBe('0 1em');

    const three = declaration({ margin: '1em 2em -0.5em' });
    neutralizeNegativeVerticalMargins(three.style);
    expect(three.read().margin).toBe('1em 2em 0');

    // `a b c d` → 上 右 下 左：下标 0 与 2 是垂直位。
    const four = declaration({ margin: '1em 2em -0.5em 3em' });
    neutralizeNegativeVerticalMargins(four.style);
    expect(four.read().margin).toBe('1em 2em 0 3em');
  });

  it('处理 margin-block 简写（start/end 两个分量）', () => {
    const { style, read } = declaration({ 'margin-block': '-1em 2em' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()['margin-block']).toBe('0 2em');
  });

  it('无法解析的值按非负处理，不误伤', () => {
    // `auto` 等关键字 parseFloat 得到 NaN，NaN < 0 为 false。
    const { style, read } = declaration({ 'margin-top': 'auto', 'margin-bottom': '' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()).toMatchObject({ 'margin-top': 'auto', 'margin-bottom': '' });
  });

  it('不误伤左右外边距', () => {
    const { style, read } = declaration({ 'margin-left': '-3em', 'margin-right': '-2em' });
    neutralizeNegativeVerticalMargins(style);
    expect(read()).toMatchObject({ 'margin-left': '-3em', 'margin-right': '-2em' });
  });
});
