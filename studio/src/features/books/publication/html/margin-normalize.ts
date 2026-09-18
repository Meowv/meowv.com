/**
 * 出版方样式里的负垂直外边距会把段落互相叠压，必须归零。
 *
 * ## 为什么在**样式层**做，而不是挂载后逐元素改内联样式
 *
 * 书内 CSS 的作用域是全局的：`scopeCss` 把选择器改写成 `.books-publication-body p`，
 * 而每个渲染槽位都有自己的 `.books-publication-body`。于是一个槽位后插入的 `<style>`
 * 会命中**已经挂载好的其他槽位**，而那时逐元素归一化早就跑完了，再也不会重跑。
 *
 * 三体 EPUB 实测：目录页（chapter37）先挂载且自身没内联到样式，等正文章节插入样式后，
 * 它的 37 个段落全部变成 `margin-bottom: -14.4px` 且再不会被修正 —— 整页文字重叠。
 * 单槽位顺序渲染永远复现不出来，必须两个槽位混装不同章节才会暴露。
 *
 * 在样式里归零就没有时序问题：不管样式何时插入、被哪个槽位命中，都不存在负值。
 * 顺带省掉了每次挂载对整章（大章节 1869 个节点）跑 `getComputedStyle` + `setProperty`。
 *
 * ## 关键不变量：只归零负的那一侧
 *
 * `<p>` 的 `margin-top` 通常来自 UA 默认样式（`1em`，正值），与书内 `margin-bottom: -0.8em`
 * 折叠后净间距是 `0.2em`；若把两侧都归零，折叠结果变成 `0`，段落间距反而更小、页数更少。
 * 三体 EPUB 实测：只归零 `margin-bottom` → 1293 页；两侧都归零 → 1048 页（正确值应为 1293）。
 */

/** 垂直外边距的长写属性。 */
const VERTICAL_LONGHANDS = [
  'margin-top',
  'margin-bottom',
  'margin-block-start',
  'margin-block-end',
] as const;

/** 与 `CSSStyleDeclaration` 结构兼容，便于在无 DOM 环境下测试。 */
export interface MarginStyleDeclaration {
  getPropertyValue(property: string): string;
  setProperty(property: string, value: string): void;
}

/**
 * 简写属性里代表「上/下」的分量下标。
 * `margin: a` → 四边；`a b` → 上下 a；`a b c` → 上 a 下 c；`a b c d` → 上 a 下 c。
 */
function verticalShorthandIndexes(property: string, count: number): number[] {
  if (property === 'margin-block') return count === 1 ? [0] : [0, 1];
  if (count === 1 || count === 2) return [0];
  return [0, 2];
}

/** 就地归零 `style` 里的负垂直外边距。正值、`auto`、无法解析的值一律不动。 */
export function neutralizeNegativeVerticalMargins(style: MarginStyleDeclaration): void {
  for (const property of VERTICAL_LONGHANDS) {
    const value = style.getPropertyValue(property);
    if (value && Number.parseFloat(value) < 0) style.setProperty(property, '0');
  }
  for (const property of ['margin', 'margin-block'] as const) {
    const value = style.getPropertyValue(property);
    if (!value) continue;
    const parts = value.split(/\s+/).filter(Boolean);
    if (!parts.length || parts.length > 4) continue;
    let changed = false;
    for (const index of verticalShorthandIndexes(property, parts.length)) {
      if (Number.parseFloat(parts[index]) < 0) {
        parts[index] = '0';
        changed = true;
      }
    }
    if (changed) style.setProperty(property, parts.join(' '));
  }
}
