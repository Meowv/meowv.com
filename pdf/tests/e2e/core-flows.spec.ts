import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const fixtureDir = join(process.cwd(), "tests", "fixtures", "e2e");
const firstPdf = join(fixtureDir, "first.pdf");
const secondPdf = join(fixtureDir, "second.pdf");
const multiPagePdf = join(fixtureDir, "multi-page.pdf");
const invalidFile = join(fixtureDir, "not-a-pdf.txt");

async function createPdf(path: string, labels: string[]): Promise<void> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = document.addPage([420, 594]);
    page.drawText(label, { x: 50, y: 520, size: 24, font });
  }
  await writeFile(path, await document.save());
}

test.beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  await Promise.all([
    createPdf(firstPdf, ["FIRST"]),
    createPdf(secondPdf, ["SECOND"]),
    createPdf(multiPagePdf, ["PAGE 1", "PAGE 2", "PAGE 3"]),
    writeFile(invalidFile, "this is not a pdf")
  ]);
});

test("从首页完成两个 PDF 的排序、合并与下载", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "在线 PDF 处理" })).toBeVisible();

  await page.getByRole("link", { name: /合并 PDF/ }).click();
  await expect(page).toHaveURL(/\/merge-pdf$/);

  await page.locator(".dropzone input[type=file]").setInputFiles([firstPdf, secondPdf]);
  await expect(page.locator(".file-row")).toHaveCount(2);
  await page.getByRole("button", { name: "上移 second.pdf" }).click();
  await expect(page.locator(".file-row strong").first()).toHaveText("second.pdf");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "合并 PDF" }).click();
  await expect(page.getByRole("heading", { name: "处理完成" })).toBeVisible();
  await page.getByRole("button", { name: "下载" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("merged.pdf");
});

test("提取多页 PDF 的指定页面并生成结果", async ({ page }) => {
  await page.goto("/extract-pdf-pages");
  await page.locator(".dropzone input[type=file]").setInputFiles(multiPagePdf);
  await expect(page.locator(".thumbnail-card")).toHaveCount(3);

  await page.getByRole("button", { name: "选择原第 1 页，当前第 1 页" }).click();
  await page.getByRole("button", { name: "选择原第 3 页，当前第 3 页" }).click({
    modifiers: ["Control"]
  });
  await page.getByRole("button", { name: "提取选中页面" }).click();
  await expect(page.getByRole("heading", { name: "处理完成" })).toBeVisible();
  await expect(page.getByText("extracted.pdf")).toBeVisible();
});

test("无效文件会显示明确错误且不会进入处理状态", async ({ page }) => {
  await page.goto("/merge-pdf");
  await page.locator(".dropzone input[type=file]").setInputFiles(invalidFile);
  await expect(page.getByRole("alert")).toContainText("请选择扩展名为 .pdf 的文件");
  await expect(page.getByRole("button", { name: "合并 PDF" })).toHaveCount(0);
});

test("主题偏好持久化，刷新不会保留文件工作区", async ({ page }) => {
  await page.goto("/");
  const themeButton = page.locator(".theme-switch");
  await themeButton.click();
  await themeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/split-pdf");
  await page.locator(".dropzone input[type=file]").setInputFiles(multiPagePdf);
  await expect(page.locator(".pdf-viewer")).toBeVisible();
  await page.reload();
  await expect(page.locator(".dropzone")).toBeVisible();
});

test("移动端导航和主要工具入口可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航菜单" }).click();
  await expect(page.getByRole("navigation", { name: "移动端导航" })).toBeVisible();
  await page.getByRole("link", { name: "隐私说明" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
