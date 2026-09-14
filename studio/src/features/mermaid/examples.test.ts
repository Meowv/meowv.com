import { describe, expect, it } from 'vitest';
import { DEFAULT_MERMAID_CONFIG, DEFAULT_MERMAID_SOURCE, MERMAID_EXAMPLES } from './examples';

describe('Mermaid example catalog', () => {
  it('keeps the complete bundled catalog and explicit extension boundary', () => {
    expect(MERMAID_EXAMPLES).toHaveLength(73);
    expect(new Set(MERMAID_EXAMPLES.map((example) => example.category)).size).toBe(31);
    expect(MERMAID_EXAMPLES.every((example) => example.available !== false)).toBe(true);
  });

  it('uses the reference first example and a safe default config', () => {
    expect(DEFAULT_MERMAID_SOURCE).toContain('flowchart TD');
    expect(DEFAULT_MERMAID_CONFIG).toContain('"theme": "default"');
  });
});
