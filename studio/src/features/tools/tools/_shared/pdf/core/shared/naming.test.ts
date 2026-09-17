import { describe, expect, it } from 'vitest';
import { sanitizeFileName, stripFileExtension } from './naming';

describe('sanitizeFileName', () => {
  it('把路径非法字符替换为连字符', () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i', 'png')).toBe('a-b-c-d-e-f-g-h-i.png');
  });

  it('去掉控制字符', () => {
    expect(sanitizeFileName('a\nb\tc', 'png')).toBe('a-b-c.png');
  });

  it('去掉零宽与双向控制字符', () => {
    expect(sanitizeFileName('a\u200bb\u202ec\ufeffd', 'png')).toBe('abcd.png');
  });

  it('合并连续空白并去掉首尾空白', () => {
    expect(sanitizeFileName('  我的  文件  ', 'png')).toBe('我的 文件.png');
  });

  it('去掉结尾的点与空格', () => {
    expect(sanitizeFileName('name. ', 'png')).toBe('name.png');
    expect(sanitizeFileName('name...', 'png')).toBe('name.png');
  });

  it('去掉重复的扩展名后缀', () => {
    expect(sanitizeFileName('report.pdf', 'pdf')).toBe('report.pdf');
    expect(sanitizeFileName('report.pdf.pdf', 'pdf')).toBe('report.pdf');
    expect(sanitizeFileName('report.PDF', 'pdf')).toBe('report.pdf');
  });

  it('扩展名大小写不敏感且容忍前导点', () => {
    expect(sanitizeFileName('a', 'PNG')).toBe('a.png');
    expect(sanitizeFileName('a', '.png')).toBe('a.png');
  });

  it('清洗后为空时使用兜底名称', () => {
    expect(sanitizeFileName('   ', 'png')).toBe('processed.png');
    expect(sanitizeFileName('...', 'png')).toBe('processed.png');
    expect(sanitizeFileName('', 'png')).toBe('processed.png');
  });

  it('全部为非法字符时保留连字符占位而不使用兜底名称', () => {
    expect(sanitizeFileName('/', 'png')).toBe('-.png');
  });

  it('支持自定义兜底名称', () => {
    expect(sanitizeFileName('', 'png', 'merged')).toBe('merged.png');
  });

  it('保留中文与数字', () => {
    expect(sanitizeFileName('第1章 引言', 'pdf')).toBe('第1章 引言.pdf');
  });

  it('扩展名本身也会被规范为小写', () => {
    expect(sanitizeFileName('a', 'JPEG')).toBe('a.jpeg');
  });
});

describe('stripFileExtension', () => {
  it('去掉最后一个扩展名', () => {
    expect(stripFileExtension('a.md')).toBe('a');
    expect(stripFileExtension('archive.tar.gz')).toBe('archive.tar');
  });

  it('没有扩展名时原样返回', () => {
    expect(stripFileExtension('noext')).toBe('noext');
  });

  it('以点开头的隐藏文件视为没有扩展名', () => {
    expect(stripFileExtension('.gitignore')).toBe('.gitignore');
  });

  it('结尾为点时视为扩展名为空并去掉该点', () => {
    expect(stripFileExtension('a.')).toBe('a');
  });
});
