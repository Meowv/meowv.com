import type { Markmap } from 'markmap-view';
import { sanitizeMindHtml } from '../security';

interface MarkmapNode {
  content: string;
  children: MarkmapNode[];
}

function sanitizeTree(node: MarkmapNode): MarkmapNode {
  node.content = sanitizeMindHtml(node.content);
  node.children.forEach(sanitizeTree);
  return node;
}

export class MarkmapAdapter {
  private instance: Markmap | null = null;
  private theme: 'light' | 'dark' = 'light';
  private color = '#2563a8';

  async mount(
    svg: SVGSVGElement,
    markdown: string,
    theme: 'light' | 'dark',
    color: string,
  ): Promise<void> {
    this.theme = theme;
    this.color = color;
    const [{ Transformer }, { Markmap }] = await Promise.all([
      import('markmap-lib'),
      import('markmap-view'),
    ]);
    const transformer = new Transformer();
    const { root } = transformer.transform(markdown);
    this.dispose();
    this.instance = Markmap.create(
      svg,
      {
        autoFit: true,
        duration: 180,
        maxWidth: 240,
        color: () => this.color,
      },
      sanitizeTree(root),
    );
  }

  async update(markdown: string): Promise<void> {
    if (!this.instance) return;
    const { Transformer } = await import('markmap-lib');
    const { root } = new Transformer().transform(markdown);
    await this.instance.setData(sanitizeTree(root));
  }

  fit(): Promise<void> | undefined {
    return this.instance?.fit();
  }
  zoomIn(): Promise<void> | undefined {
    return this.instance?.rescale(1.15);
  }
  zoomOut(): Promise<void> | undefined {
    return this.instance?.rescale(0.85);
  }
  setTheme(theme: 'light' | 'dark', color: string): void {
    this.theme = theme;
    this.color = color;
    this.instance?.setOptions({ color: () => this.color });
    void this.instance?.renderData();
  }
  dispose(): void {
    this.instance?.destroy();
    this.instance = null;
  }
}
