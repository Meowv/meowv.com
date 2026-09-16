import { parse } from '@visimer/core';
import { describe, expect, it } from 'vitest';
import {
  addActionFor,
  selectionSupportsConnect,
  visualReadOnly,
} from '@/features/mermaid/visual/capabilities';

describe('Mermaid visual capabilities', () => {
  it('offers a semantic add operation for editable diagram types', () => {
    expect(addActionFor(parse('flowchart TD\n  A --> B'))?.operation.type).toBe('addNode');
    expect(addActionFor(parse('stateDiagram-v2\n  A --> B'))?.operation.type).toBe('st.addState');
    expect(addActionFor(parse('classDiagram\n  A --> B'))?.operation.type).toBe('cl.addClass');
    expect(addActionFor(parse('erDiagram\n  A ||--o{ B : has'))?.operation.type).toBe(
      'er.addEntity',
    );
  });

  it('does not offer add for view-only diagram types', () => {
    expect(addActionFor(parse('zenuml\n  A.method()'))).toBeNull();
    expect(visualReadOnly(parse('zenuml\n  A.method()'))).toBe(true);
  });

  it('only exposes connect for supported selected entities', () => {
    const flowchart = parse('flowchart TD\n  A --> B');
    expect(selectionSupportsConnect(flowchart, ['node:A'])).toBe(true);
    expect(selectionSupportsConnect(flowchart, ['edge:A->B#0'])).toBe(false);
    expect(selectionSupportsConnect(flowchart, ['node:A', 'node:B'])).toBe(false);
  });
});
