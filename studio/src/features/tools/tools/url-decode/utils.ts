export function decodeUrlComponent(input: string): string {
  if (!input.trim()) throw new Error('请输入需要解码的 URL 内容。');
  try {
    return decodeURIComponent(input.replace(/\+/g, ' '));
  } catch {
    throw new Error('URL 编码格式无效，请检查百分号后的十六进制字符。');
  }
}
