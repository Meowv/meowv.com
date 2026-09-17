import { describe, expect, it } from 'vitest';
import { getOutputFilename } from './filename';

describe('getOutputFilename', () => {
  it('按输出 MIME 替换扩展名', () => {
    expect(getOutputFilename('photo.png', 'image/jpeg')).toBe('photo.jpg');
    expect(getOutputFilename('photo.png', 'image/webp')).toBe('photo.webp');
    expect(getOutputFilename('photo.png', 'image/svg+xml')).toBe('photo.svg');
    expect(getOutputFilename('photo.png', 'image/vnd.microsoft.icon')).toBe('photo.ico');
  });

  it('接受别名 MIME', () => {
    expect(getOutputFilename('photo.png', 'image/jpg')).toBe('photo.jpg');
  });

  it('追加后缀', () => {
    expect(getOutputFilename('photo.png', 'image/jpeg', '-compressed')).toBe(
      'photo-compressed.jpg',
    );
    expect(getOutputFilename('photo.png', 'image/png', '_small')).toBe('photo_small.png');
  });

  it('清洗后缀中的非法字符与控制字符', () => {
    expect(getOutputFilename('photo.png', 'image/png', 'x/y:z')).toBe('photox-y-z.png');
    expect(getOutputFilename('photo.png', 'image/png', '\u0001')).toBe('photo-.png');
  });

  it('去掉路径部分', () => {
    expect(getOutputFilename('a/b/c.png', 'image/png')).toBe('c.png');
    expect(getOutputFilename('a\\b\\c.png', 'image/png')).toBe('c.png');
  });

  it('去掉文件名首尾空白', () => {
    expect(getOutputFilename('  photo.png  ', 'image/png')).toBe('photo.png');
  });

  it('只替换最后一个扩展名', () => {
    expect(getOutputFilename('archive.tar.gz', 'image/png')).toBe('archive.tar.png');
  });

  it('没有扩展名时直接追加', () => {
    expect(getOutputFilename('photo', 'image/png')).toBe('photo.png');
  });

  it('以点开头的隐藏文件保留文件名', () => {
    expect(getOutputFilename('.hidden', 'image/png')).toBe('.hidden.png');
  });

  it('文件名为空时使用默认名', () => {
    expect(getOutputFilename('', 'image/png')).toBe('image.png');
  });

  it('输出格式不受支持时抛错', () => {
    expect(() => getOutputFilename('photo.png', 'image/gif')).toThrow(
      '不支持的输出格式：image/gif',
    );
  });
});
