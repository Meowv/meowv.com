import { describe, expect, it } from 'vitest';
import { decodeBookText, splitTextSections } from './text-utils';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

function concat(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrays = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)));
  const total = arrays.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const part of arrays) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

describe('decodeBookText', () => {
  it('解码无 BOM 的 UTF-8 文本', () => {
    expect(decodeBookText(utf8('你好，世界'))).toBe('你好，世界');
  });

  it('跳过 UTF-8 BOM', () => {
    expect(decodeBookText(concat([0xef, 0xbb, 0xbf], utf8('你好')))).toBe('你好');
  });

  it('解码 UTF-16LE 并跳过 BOM', () => {
    // BOM + “你好”（U+4F60 U+597D）的小端字节序
    expect(decodeBookText(concat([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]))).toBe('你好');
  });

  it('解码 UTF-16BE 并跳过 BOM', () => {
    // BOM + “你好”的大端字节序
    expect(decodeBookText(concat([0xfe, 0xff, 0x4f, 0x60, 0x59, 0x7d]))).toBe('你好');
  });

  it('UTF-8 解码失败时回退到 GB18030', () => {
    // “中文”的 GBK 字节，作为 UTF-8 是非法序列
    expect(decodeBookText(concat([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文');
  });

  it('两种编码都失败时使用替换字符兜底而不抛错', () => {
    const decoded = decodeBookText(concat([0xff, 0xfd]));

    expect(typeof decoded).toBe('string');
    expect(decoded.length).toBeGreaterThan(0);
  });

  it('空输入返回空字符串', () => {
    expect(decodeBookText(new Uint8Array(0))).toBe('');
  });
});

describe('splitTextSections', () => {
  it('按中文章节标题切分', () => {
    expect(splitTextSections('第一章 开端\n正文一\n第二章 转折\n正文二')).toEqual([
      { title: '第一章 开端', content: '正文一' },
      { title: '第二章 转折', content: '正文二' },
    ]);
  });

  it('识别序章、楔子、前言、后记、尾声与引子', () => {
    const sections = splitTextSections(
      '序章\n甲\n楔子\n乙\n前言\n丙\n后记\n丁\n尾声\n戊\n引子\n己',
    );

    expect(sections.map((section) => section.title)).toEqual([
      '序章',
      '楔子',
      '前言',
      '后记',
      '尾声',
      '引子',
    ]);
  });

  it('识别标题后的冒号与顿号等分隔符', () => {
    const sections = splitTextSections('第一章：开端\n甲\n第二章、转折\n乙');

    expect(sections.map((section) => section.title)).toEqual(['第一章：开端', '第二章、转折']);
  });

  it('识别中文数字与阿拉伯数字章节号', () => {
    const sections = splitTextSections('第十二章\n甲\n第3章\n乙\n第100回\n丙');

    expect(sections.map((section) => section.title)).toEqual(['第十二章', '第3章', '第100回']);
  });

  it('首个章节之前的内容归入无标题分节', () => {
    expect(splitTextSections('书名页\n作者\n第一章 开端\n正文')).toEqual([
      { title: null, content: '书名页\n作者' },
      { title: '第一章 开端', content: '正文' },
    ]);
  });

  it('没有章节标记时整篇作为单个无标题分节', () => {
    expect(splitTextSections('第一段\n第二段')).toEqual([
      { title: null, content: '第一段\n第二段' },
    ]);
  });

  it('归一化 CRLF 与 CR 换行', () => {
    expect(splitTextSections('第一章\r\n甲\r乙')).toEqual([{ title: '第一章', content: '甲\n乙' }]);
  });

  it('标题行过长时不视为章节', () => {
    const longTail = 'x'.repeat(65);
    const sections = splitTextSections(`第一章${longTail}\n正文`);

    expect(sections).toEqual([{ title: null, content: `第一章${longTail}\n正文` }]);
  });

  it('章节正文超过长度上限时继续分片且不丢内容', () => {
    const lines = Array.from({ length: 100 }, () => 'a'.repeat(1000));
    const sections = splitTextSections(`第一章\n${lines.join('\n')}`);

    // 每行计入 1001 个字符，累计到 72000 时在第 72 行触发分片。
    expect(sections.map((section) => [section.title, section.content.split('\n').length])).toEqual([
      ['第一章', 72],
      [null, 28],
    ]);
    expect(sections.flatMap((section) => section.content.split('\n'))).toEqual(lines);
  });

  it('只有空白内容时抛出可读错误', () => {
    expect(() => splitTextSections('   \n\n  ')).toThrow('TXT 文件没有可阅读的文字。');
  });

  it('空字符串抛出可读错误', () => {
    expect(() => splitTextSections('')).toThrow('TXT 文件没有可阅读的文字。');
  });
});
