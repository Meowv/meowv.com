import MindElixir, { type MindElixirData, type NodeObj } from 'mind-elixir';

interface OutlineNode {
  topic: string;
  children: OutlineNode[];
}

function cleanInline(value: string): string {
  return value
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

function nodeFromOutline(node: OutlineNode): NodeObj {
  return {
    id: crypto.randomUUID(),
    topic: node.topic || '未命名节点',
    children: node.children.map(nodeFromOutline),
  };
}

export function markdownToMind(markdown: string, fallbackTitle: string): MindElixirData {
  const lines = markdown.split(/\r?\n/);
  const root: OutlineNode = { topic: fallbackTitle || '未命名思维导图', children: [] };
  const stack: Array<{ depth: number; node: OutlineNode }> = [{ depth: 0, node: root }];
  let headingCount = 0;

  for (const raw of lines) {
    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    const item = raw.match(/^(\s*)(?:[-*+] |\d+\. )(.+)$/);
    if (!heading && !item) continue;
    const depth = heading
      ? heading[1].length
      : Math.floor(item![1].replace(/\t/g, '  ').length / 2) + 2;
    const node: OutlineNode = { topic: cleanInline(heading?.[2] ?? item![2]), children: [] };
    if (heading?.[1].length === 1) headingCount += 1;
    while (stack.length > 1 && stack.at(-1)!.depth >= depth) stack.pop();
    stack.at(-1)!.node.children.push(node);
    stack.push({ depth, node });
  }

  if (headingCount === 1 && root.children.length === 1) {
    const onlyHeading = root.children[0]!;
    root.topic = onlyHeading.topic;
    root.children = onlyHeading.children;
  }
  const data = MindElixir.new(root.topic);
  data.nodeData.children = root.children.map(nodeFromOutline);
  return data;
}

function markdownFromNode(node: NodeObj, depth: number): string[] {
  const topic = node.topic?.trim() || '未命名节点';
  const linked = node.hyperLink ? `[${topic}](${node.hyperLink})` : topic;
  const line = depth === 1 ? `# ${linked}` : `${'  '.repeat(depth - 2)}- ${linked}`;
  return [line, ...(node.children ?? []).flatMap((child) => markdownFromNode(child, depth + 1))];
}

export function mindToMarkdown(data: MindElixirData): string {
  return markdownFromNode(data.nodeData, 1).join('\n');
}

export function textOutlineToMind(text: string, fallbackTitle: string): MindElixirData {
  return markdownToMind(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => `${line.match(/^\s*/)?.[0].replace(/\t/g, '  ') ?? ''}- ${line.trim()}`)
      .join('\n'),
    fallbackTitle,
  );
}
