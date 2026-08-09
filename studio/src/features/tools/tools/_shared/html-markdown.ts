function text(value: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function nodeToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes)
    .map((child) => nodeToMarkdown(child, depth))
    .join('');
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${text(children)}\n\n`;
  if (tag === 'p') return `${children.trim()}\n\n`;
  if (tag === 'br') return '  \n';
  if (tag === 'strong' || tag === 'b') return `**${children}**`;
  if (tag === 'em' || tag === 'i') return `*${children}*`;
  if (tag === 'del' || tag === 's') return `~~${children}~~`;
  if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre')
    return `\`${children}\``;
  if (tag === 'pre') return `\n\`\`\`\n${node.textContent?.trim() ?? ''}\n\`\`\`\n\n`;
  if (tag === 'a')
    return `[${children || node.getAttribute('href') || ''}](${node.getAttribute('href') || ''})`;
  if (tag === 'img')
    return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
  if (tag === 'blockquote')
    return `${children
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}\n\n`;
  if (tag === 'li') {
    const inline = Array.from(node.childNodes)
      .filter(
        (child) =>
          !(child instanceof Element && ['ul', 'ol'].includes(child.tagName.toLowerCase())),
      )
      .map((child) => nodeToMarkdown(child, depth))
      .join('')
      .trim();
    const nested = Array.from(node.children)
      .filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase()))
      .map((child) => nodeToMarkdown(child, depth + 1))
      .join('');
    return `${'  '.repeat(depth)}- ${inline}\n${nested}`;
  }
  if (tag === 'ul' || tag === 'ol')
    return `${Array.from(node.children)
      .map((child) => nodeToMarkdown(child, depth))
      .join('')}\n`;
  if (tag === 'hr') return '---\n\n';
  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map((row) =>
      Array.from(row.querySelectorAll('th,td')).map((cell) =>
        text(cell.textContent).replace(/\|/g, '\\|'),
      ),
    );
    if (!rows.length) return '';
    return (
      [...rows.slice(0, 1), rows[0].map(() => '---'), ...rows.slice(1)]
        .map((row) => `| ${row.join(' | ')} |`)
        .join('\n') + '\n\n'
    );
  }
  return children;
}

export function htmlToMarkdown(input: string): string {
  const documentNode = new DOMParser().parseFromString(input, 'text/html');
  return Array.from(documentNode.body.childNodes)
    .map((node) => nodeToMarkdown(node))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
