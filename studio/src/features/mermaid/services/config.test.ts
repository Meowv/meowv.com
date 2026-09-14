import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISUAL_CONFIG,
  parseMermaidConfig,
  renderConfigForTheme,
  sanitizeMermaidConfig,
  sourceHasInlineConfig,
  updateDocumentVisualConfig,
  visualConfigFromDocument,
} from './config';

describe('Mermaid visual configuration', () => {
  it('keeps invalid JSON visible instead of silently falling back', () => {
    const result = parseMermaidConfig('{"theme":');
    expect(result.value).toEqual({});
    expect(result.error).toContain('配置 JSON 无效');
  });

  it('maps built-in controls to the document config without dropping custom fields', () => {
    const next = updateDocumentVisualConfig(
      { customField: 'keep', flowchart: { curve: 'linear' } },
      { theme: 'dark', look: 'handDrawn', nodeSpacing: 90 },
    );
    expect(next).toMatchObject({
      customField: 'keep',
      theme: 'dark',
      look: 'handDrawn',
      flowchart: { curve: 'linear', nodeSpacing: 90 },
    });
  });

  it('locks platform security while deriving the effective UI theme', () => {
    const config = renderConfigForTheme(
      { theme: 'auto', securityLevel: 'loose', startOnLoad: true },
      'dark',
    );
    expect(config.theme).toBe('dark');
    expect(config.securityLevel).toBe('strict');
    expect(config.startOnLoad).toBe(false);
    expect(config.suppressErrorRendering).toBe(true);
  });

  it('follows the dark Studio surface for the default chart theme', () => {
    expect(renderConfigForTheme({ theme: 'default' }, 'dark').theme).toBe('dark');
    expect(renderConfigForTheme({ theme: 'default' }, 'light').theme).toBe('default');
    expect(renderConfigForTheme({ theme: 'forest' }, 'dark').theme).toBe('forest');
  });

  it('applies root visual controls when rendering the sanitized config', () => {
    const config = renderConfigForTheme({ fontSize: 24, useMaxWidth: false }, 'light');
    expect(config.fontSize).toBe(24);
    expect(config.themeVariables?.fontSize).toBe('24px');
    expect(config.flowchart?.useMaxWidth).toBe(false);
  });

  it('detects inline Mermaid config directives', () => {
    expect(sourceHasInlineConfig('---\nconfig:\n  theme: dark\n---\nflowchart TD\nA-->B')).toBe(
      true,
    );
    expect(sourceHasInlineConfig('%%{init: {"theme":"forest"}}%%\ngraph TD\nA-->B')).toBe(true);
    expect(sourceHasInlineConfig('flowchart TD\nA-->B')).toBe(false);
  });

  it('uses safe defaults for unknown visual values', () => {
    expect(visualConfigFromDocument({ theme: 'neo', fontSize: 200 })).toMatchObject({
      ...DEFAULT_VISUAL_CONFIG,
      theme: 'default',
      fontSize: 48,
    });
    expect(visualConfigFromDocument({ theme: 'auto' }).theme).toBe('default');
  });

  it('bounds imported renderer config and removes resource escape hatches', () => {
    const safe = sanitizeMermaidConfig({
      theme: 'dark',
      themeCSS: '.node { background: url(https://example.test/x) }',
      dompurifyConfig: { ADD_TAGS: ['iframe'] },
      securityLevel: 'loose',
      maxTextSize: 999_999_999,
      maxEdges: 999_999_999,
      themeVariables: { primaryColor: 'url(https://example.test/x)', lineColor: '#123456' },
      title: '保留图表标题',
    });
    expect(safe).not.toHaveProperty('themeCSS');
    expect(safe).not.toHaveProperty('dompurifyConfig');
    expect(safe).not.toHaveProperty('securityLevel');
    expect(safe.maxTextSize).toBe(200_000);
    expect(safe.maxEdges).toBe(10_000);
    expect(safe.themeVariables).toEqual({ lineColor: '#123456' });
    expect(safe.title).toBe('保留图表标题');
  });
});
