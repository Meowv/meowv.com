export type TextProcessMode =
  | 'word-count'
  | 'character-count'
  | 'line-count'
  | 'reading-time'
  | 'text-diff'
  | 'markdown-diff'
  | 'trim-spaces'
  | 'remove-empty-lines'
  | 'remove-duplicate-lines'
  | 'sort-lines'
  | 'case-converter'
  | 'camel-case-converter'
  | 'snake-case-converter'
  | 'markdown-table-generator'
  | 'lorem-ipsum'
  | 'dummy-text';

function wordSegments(input: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  return Array.from(segmenter.segment(input))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
}

function textStatistics(input: string): Record<string, number> {
  const characters = Array.from(input);
  const words = wordSegments(input);
  const lines = input ? input.split(/\r?\n/).length : 0;
  return {
    words: words.length,
    characters: characters.length,
    charactersWithoutSpaces: characters.filter((character) => !/\s/.test(character)).length,
    lines,
    paragraphs: input.trim() ? input.trim().split(/\n\s*\n/).length : 0,
    bytes: new TextEncoder().encode(input).length,
  };
}

function lineDiff(before: string, after: string): string {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  if (left.length * right.length > 1_000_000)
    throw new Error('内容过长，请将对比范围控制在约 1000 行以内。');
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }
  const result: string[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (
      leftIndex < left.length &&
      rightIndex < right.length &&
      left[leftIndex] === right[rightIndex]
    ) {
      result.push(`  ${left[leftIndex]}`);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      rightIndex < right.length &&
      (leftIndex >= left.length ||
        table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])
    ) {
      result.push(`+ ${right[rightIndex]}`);
      rightIndex += 1;
    } else {
      result.push(`- ${left[leftIndex]}`);
      leftIndex += 1;
    }
  }
  const additions = result.filter((line) => line.startsWith('+ ')).length;
  const deletions = result.filter((line) => line.startsWith('- ')).length;
  return [`新增 ${additions} 行 · 删除 ${deletions} 行`, '', ...result].join('\n');
}

function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLocaleLowerCase());
}

function markdownTable(input: string): string {
  const rows = input
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) =>
      line.split(line.includes('\t') ? '\t' : ',').map((cell) => cell.trim().replace(/\|/g, '\\|')),
    );
  if (!rows.length) throw new Error('请输入至少一行表格数据。');
  const columns = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) =>
    Array.from({ length: columns }, (_, index) => row[index] ?? ''),
  );
  return [normalized[0], Array.from({ length: columns }, () => '---'), ...normalized.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

const loremSentences = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Integer posuere erat a ante venenatis dapibus posuere velit aliquet.',
  'Donec ullamcorper nulla non metus auctor fringilla.',
  'Maecenas faucibus mollis interdum, sed posuere consectetur est at lobortis.',
  'Praesent commodo cursus magna, vel scelerisque nisl consectetur et.',
];

const dummySentences = [
  '这是一段用于界面排版与内容测试的示例文本。',
  '所有内容都在浏览器本地生成，不会上传到服务器。',
  '可以调整段落数量，快速检查字号、行高和留白效果。',
  '示例内容没有特定含义，可直接复制到原型或测试页面。',
  '当真实文案尚未准备好时，它能帮助团队确认整体阅读节奏。',
];

function generatedText(sentences: string[], paragraphs: number): string {
  return Array.from(
    { length: Math.max(1, Math.min(20, Math.trunc(paragraphs || 1))) },
    (_, paragraph) =>
      Array.from(
        { length: 3 },
        (_, index) => sentences[(paragraph * 2 + index) % sentences.length],
      ).join(' '),
  ).join('\n\n');
}

export function processText(
  mode: TextProcessMode,
  input: string,
  secondInput: string,
  option: string,
  amount: number,
): string {
  const stats = textStatistics(input);
  if (mode === 'word-count')
    return `词语数量：${stats.words}\n段落数量：${stats.paragraphs}\n字符数量：${stats.characters}`;
  if (mode === 'character-count')
    return `字符总数：${stats.characters}\n不含空白：${stats.charactersWithoutSpaces}\nUTF-8 字节：${stats.bytes}`;
  if (mode === 'line-count')
    return `总行数：${stats.lines}\n非空行：${input.split(/\r?\n/).filter((line) => line.trim()).length}\n段落数量：${stats.paragraphs}`;
  if (mode === 'reading-time') {
    const minutes = stats.words / 300;
    return `词语数量：${stats.words}\n预计阅读：${minutes < 1 ? `${Math.max(1, Math.ceil(minutes * 60))} 秒` : `${minutes.toFixed(1)} 分钟`}\n按每分钟 300 个词语估算`;
  }
  if (mode === 'text-diff' || mode === 'markdown-diff') return lineDiff(input, secondInput);
  if (mode === 'trim-spaces')
    return input
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/[ \t]+/g, ' '))
      .join('\n');
  if (mode === 'remove-empty-lines')
    return input
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .join('\n');
  if (mode === 'remove-duplicate-lines')
    return Array.from(new Set(input.split(/\r?\n/))).join('\n');
  if (mode === 'sort-lines')
    return input
      .split(/\r?\n/)
      .sort((left, right) =>
        option === 'desc' ? right.localeCompare(left) : left.localeCompare(right),
      )
      .join('\n');
  if (mode === 'case-converter') {
    if (option === 'lower') return input.toLocaleLowerCase();
    if (option === 'title')
      return input
        .toLocaleLowerCase()
        .replace(/(^|\s)\p{L}/gu, (value) => value.toLocaleUpperCase());
    return input.toLocaleUpperCase();
  }
  if (mode === 'camel-case-converter') {
    const parts = words(input);
    return parts
      .map((part, index) =>
        index ? `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}` : part,
      )
      .join('');
  }
  if (mode === 'snake-case-converter') return words(input).join('_');
  if (mode === 'markdown-table-generator') return markdownTable(input);
  if (mode === 'lorem-ipsum') return generatedText(loremSentences, amount);
  return generatedText(dummySentences, amount);
}
