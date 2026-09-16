import { describe, expect, it } from 'vitest';
import { translateVisualText } from '@/features/mermaid/visual/visualChrome';

describe('Mermaid visual chrome translation', () => {
  it('translates common Visimer actions and panel labels', () => {
    expect(translateVisualText('Node shape')).toBe('节点形状');
    expect(translateVisualText('Delete')).toBe('删除');
    expect(translateVisualText('Default')).toBe('默认');
  });

  it('translates color panel titles without replacing their values', () => {
    expect(translateVisualText('Fill: #ef4444')).toBe('填充：#ef4444');
    expect(translateVisualText('Stroke: default')).toBe('线条：默认');
  });

  it('keeps unknown strings untouched for forward compatibility', () => {
    expect(translateVisualText('Future action')).toBe('Future action');
  });
});
