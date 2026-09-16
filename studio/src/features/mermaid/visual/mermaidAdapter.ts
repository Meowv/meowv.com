import type { MermaidLike } from '@visimer/dom';
import type { MermaidConfig } from 'mermaid';
import { enqueueMermaidTask } from '@/core/mermaid/scheduler';
import { sanitizeMermaidSvg } from '@/features/markdown/services/mermaid-security';

let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | null = null;

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
  mermaidPromise ??= import('mermaid').then((module) => module.default);
  return mermaidPromise;
}

/**
 * Visimer renders through the same Mermaid singleton as Markdown preview and
 * export. Store the requested config here and apply it inside the shared
 * scheduler so a concurrent render cannot overwrite it.
 */
export function createSerializedMermaidAdapter(): MermaidLike {
  let config: MermaidConfig = {};

  return {
    initialize(nextConfig) {
      config = nextConfig as MermaidConfig;
    },
    async render(id, code) {
      return enqueueMermaidTask(async () => {
        const mermaid = await loadMermaid();
        mermaid.initialize(config);
        const result = await mermaid.render(id, code);
        return {
          ...result,
          svg: sanitizeMermaidSvg(result.svg),
        };
      });
    },
    async parse(code, options) {
      return enqueueMermaidTask(async () => {
        const mermaid = await loadMermaid();
        mermaid.initialize(config);
        return mermaid.parse(code, options as Parameters<typeof mermaid.parse>[1]);
      });
    },
  };
}
