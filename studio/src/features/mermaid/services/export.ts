import type { MermaidDocument } from '@/features/mermaid/types';

export function safeMermaidFilename(title: string): string {
  return (title.trim() || 'mermaid图表').replace(/[\\/:*?"<>|]/gu, '_').slice(0, 120);
}

/** 导出 Markdown 时保留原始配置，重新导入可无损恢复。 */
export function mermaidMarkdownText(source: string, configText: string): string {
  return `<!-- meowv-studio-config\n${configText}\n-->\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;
}

/** MMD 仍是可直接交给 Mermaid 的源码，配置以注释形式同行保存。 */
export function mermaidMmdText(source: string, configText: string): string {
  const configLines = configText
    .split(/\r?\n/u)
    .map((line) => `%% ${line}`)
    .join('\n');
  return `%% meowv-studio-config\n${configLines}\n%% meowv-studio-config-end\n\n${source}\n`;
}

export function mermaidDocumentJson(document: MermaidDocument): string {
  return JSON.stringify(document, null, 2);
}
