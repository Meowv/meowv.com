import { beforeEach, describe, expect, it, vi } from 'vitest';
import { featureForFile, useFileHandoff } from '@/core/browser/file-handoff';
import {
  STUDIO_FILE_ACCEPT,
  STUDIO_FILE_PICKER_TYPES,
  studioFeatureForFile,
  useFileLauncher,
} from './useFileLauncher';

const router = vi.hoisted(() => ({ push: vi.fn(async () => undefined) }));
vi.mock('vue-router', () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockClear();
  useFileHandoff().currentHandoff.value = null;
});

describe('Studio 首页文件选择范围', () => {
  it('选择器中的每种扩展名都能交给现有功能处理', () => {
    const pickerExtensions = STUDIO_FILE_PICKER_TYPES.flatMap((type) =>
      Object.values(type.accept).flat(),
    );
    expect(STUDIO_FILE_ACCEPT.split(',')).toEqual(pickerExtensions);
    for (const extension of pickerExtensions) {
      expect(featureForFile(new File([], `sample${extension}`)), extension).not.toBeNull();
    }
  });

  it('包含书籍和数据库的现有格式', () => {
    const extensions = new Set(STUDIO_FILE_ACCEPT.split(','));
    for (const extension of [
      '.epub',
      '.mobi',
      '.azw3',
      '.fb2',
      '.cbz',
      '.db',
      '.sqlite',
      '.sqlite3',
      '.db3',
    ]) {
      expect(extensions.has(extension), extension).toBe(true);
    }
  });

  it('从首页打开 PDF 时进入 Books 阅读器', () => {
    expect(studioFeatureForFile(new File([], 'sample.pdf'))).toBe('book');
    expect(studioFeatureForFile(new File([], 'sample.epub'))).toBe('book');
    expect(studioFeatureForFile(new File([], 'sample.csv'))).toBe('office');
  });

  it('将书籍文件句柄交给 Books，以便浏览器支持时恢复本地书籍', async () => {
    const handle = {} as FileSystemFileHandle;
    for (const extension of ['epub', 'pdf']) {
      const file = new File([], `sample.${extension}`);
      await useFileLauncher().launchFile(file, handle);
      expect(useFileHandoff().currentHandoff.value).toMatchObject({
        feature: 'book',
        file,
        handle,
      });
      expect(router.push).toHaveBeenLastCalledWith('/books');
    }
  });
});
