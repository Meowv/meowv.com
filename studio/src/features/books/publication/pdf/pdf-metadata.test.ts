import { describe, expect, it } from 'vitest';
import { cleanPdfMetadataText } from './pdf-metadata';

describe('cleanPdfMetadataText', () => {
  it('移除 PDF 元数据中的尾部 NUL 和其他控制字符', () => {
    expect(cleanPdfMetadataText('西游记潜规则\u0000')).toBe('西游记潜规则');
    expect(cleanPdfMetadataText('书名\u0000\n 副标题')).toBe('书名 副标题');
  });

  it('非字符串或仅有控制字符时返回空标题以便使用文件名', () => {
    expect(cleanPdfMetadataText(null)).toBe('');
    expect(cleanPdfMetadataText('\u0000\u0001')).toBe('');
  });
});
