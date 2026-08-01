import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecentDocument } from '../../lib/recent-documents';

describe('recent documents', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a local recent-document id when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {});

    await expect(createRecentDocument('新建文档.docx')).resolves.toMatch(/^new:[a-z0-9]+-[a-z0-9]+$/);
  });
});
