export interface ParsedJson {
  value: unknown;
  normalized: string;
}

function describeJsonError(input: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'JSON 格式无效';
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (!positionMatch) return message;

  const position = Number(positionMatch[1]);
  const before = input.slice(0, position);
  const line = before.split('\n').length;
  const lastLineBreak = before.lastIndexOf('\n');
  const column = position - lastLineBreak;
  return `${message}（第 ${line} 行，第 ${column} 列）`;
}

export function parseJson(input: string): ParsedJson {
  if (!input.trim()) {
    throw new Error('请输入需要处理的 JSON 内容。');
  }

  try {
    const value: unknown = JSON.parse(input);
    return { value, normalized: JSON.stringify(value) };
  } catch (error) {
    throw new Error(describeJsonError(input, error));
  }
}

export function formatJson(input: string, indent: number | string = 2): string {
  return JSON.stringify(parseJson(input).value, null, indent);
}

export function minifyJson(input: string): string {
  return parseJson(input).normalized;
}
