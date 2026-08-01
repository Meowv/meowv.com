import { expect, test } from '@playwright/test';

test('homepage loads without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#iframe')).toBeAttached();
  await expect(page.getByRole('button', { name: '新建 Word' })).toBeVisible();
  await expect(page.getByRole('button', { name: '捐赠支持' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

for (const [path, formatName] of [
  ['/doc', 'Word 文档'],
  ['/xls', 'Excel 表格'],
  ['/ppt', 'PowerPoint 演示文稿'],
  ['/csv', 'CSV 数据'],
] as const) {
  test(`${path} opens its Vue format page`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: new RegExp(formatName) })).toBeVisible();
  });
}

test('manifest and service worker assets are reachable', async ({ request }) => {
  const manifest = await request.get('/manifest.json');
  expect(manifest.ok()).toBe(true);

  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.ok()).toBe(true);
});
