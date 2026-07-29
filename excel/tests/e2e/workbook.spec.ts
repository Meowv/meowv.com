import { expect, test, type Locator, type Page } from "@playwright/test";

import { createMultiSheetXlsxFixture, MULTI_SHEET_FIXTURE_NAME } from "../fixtures/workbooks";

const BUDGET_NAME = "2026 年项目预算";
const RENAMED_BUDGET_NAME = "2026 年项目预算 E2E";
const BLANK_WORKBOOK_NAME = "未命名表格";

interface PersistedWorkbookFacts {
  name?: unknown;
  sheetNames: string[];
  a1?: unknown;
  a2?: unknown;
  a3?: unknown;
  a4Formula?: unknown;
  mergeData: unknown[];
  firstRowHeight?: unknown;
  firstColumnWidth?: unknown;
}

function workbookCard(page: Page, name: string): Locator {
  return page
    .locator("article.workbook-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

function settingRow(page: Page, label: string): Locator {
  return page
    .locator(".setting-row")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

async function createBudgetExample(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "打开网页，即刻开始编辑" })).toBeVisible();
  await page.getByRole("button", { name: "项目预算示例" }).click();
  await expect(page).toHaveURL(/\/workbook\/[^/]+$/);
  await expect(page.getByLabel("工作簿名称")).toHaveValue(BUDGET_NAME);
  await expect(page.locator('[aria-label="电子表格编辑区域"]')).toBeVisible();
}

async function createBlankWorkbook(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "打开网页，即刻开始编辑" })).toBeVisible();
  await page.getByRole("button", { name: "创建空白表格", exact: true }).click();
  await expect(page).toHaveURL(/\/workbook\/[^/]+$/);
  await expect(page.getByLabel("工作簿名称")).toHaveValue(BLANK_WORKBOOK_NAME);
  await expect(page.locator('[aria-label="电子表格编辑区域"]')).toBeVisible();
  await expect(
    page
      .getByRole("tablist", { name: "Sheet tabs" })
      .getByRole("tab", { name: "Sheet1", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
}

async function expectBudgetSheets(page: Page): Promise<void> {
  const sheetTabs = page.getByRole("tablist", { name: "Sheet tabs" });
  await expect(sheetTabs).toBeVisible({ timeout: 20_000 });
  await expect(sheetTabs.getByRole("tab", { name: "Sheet1", exact: true })).toBeVisible();
  await expect(sheetTabs.getByRole("tab", { name: "预算明细", exact: true })).toBeVisible();
}

function currentWorkbookId(page: Page): string {
  const match = new URL(page.url()).pathname.match(/^\/workbook\/([^/]+)$/);
  if (!match?.[1]) {
    throw new Error(`当前页面不是工作簿页面：${page.url()}`);
  }
  return decodeURIComponent(match[1]);
}

async function readPersistedWorkbookFacts(
  page: Page,
  workbookId: string,
): Promise<PersistedWorkbookFacts | undefined> {
  return page.evaluate(
    ({ databaseName, recordId }) =>
      new Promise<PersistedWorkbookFacts | undefined>((resolve, reject) => {
        const isRecord = (value: unknown): value is Record<string, unknown> =>
          typeof value === "object" && value !== null && !Array.isArray(value);
        const recordValue = (
          value: Record<string, unknown> | undefined,
          key: string,
        ): Record<string, unknown> | undefined => {
          const candidate = value?.[key];
          return isRecord(candidate) ? candidate : undefined;
        };

        const openRequest = indexedDB.open(databaseName);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("workbooks", "readonly");
          const getRequest = transaction.objectStore("workbooks").get(recordId);

          getRequest.onerror = () => {
            database.close();
            reject(getRequest.error);
          };
          getRequest.onsuccess = () => {
            const record: unknown = getRequest.result;
            if (!isRecord(record)) {
              database.close();
              resolve(undefined);
              return;
            }

            const snapshot = recordValue(record, "snapshot");
            const sheets = recordValue(snapshot, "sheets") ?? {};
            const sheetOrder = Array.isArray(snapshot?.sheetOrder)
              ? snapshot.sheetOrder.filter(
                  (sheetId): sheetId is string => typeof sheetId === "string",
                )
              : Object.keys(sheets);
            const sheetNames = sheetOrder.map((sheetId) => {
              const sheet = recordValue(sheets, sheetId);
              return typeof sheet?.name === "string" ? sheet.name : sheetId;
            });
            const firstSheet = sheetOrder[0] ? recordValue(sheets, sheetOrder[0]) : undefined;
            const cellData = recordValue(firstSheet, "cellData");
            const cellAt = (row: number, column: number): Record<string, unknown> | undefined =>
              recordValue(recordValue(cellData, String(row)), String(column));

            database.close();
            resolve({
              name: record.name,
              sheetNames,
              a1: cellAt(0, 0)?.v,
              a2: cellAt(1, 0)?.v,
              a3: cellAt(2, 0)?.v,
              a4Formula: cellAt(3, 0)?.f,
              mergeData: Array.isArray(firstSheet?.mergeData) ? firstSheet.mergeData : [],
              firstRowHeight: recordValue(recordValue(firstSheet, "rowData"), "0")?.h,
              firstColumnWidth: recordValue(recordValue(firstSheet, "columnData"), "0")?.w,
            });
          };
        };
      }),
    {
      databaseName: "MeowvLocalSheets",
      recordId: workbookId,
    },
  );
}

async function openFileMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "文件", exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function readPersistedSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    ({ databaseName, settingKey }) =>
      new Promise<unknown>((resolve, reject) => {
        const openRequest = indexedDB.open(databaseName);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("settings", "readonly");
          const getRequest = transaction.objectStore("settings").get("global");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            const record: unknown = getRequest.result;
            database.close();
            if (typeof record !== "object" || record === null) {
              resolve(undefined);
              return;
            }
            resolve((record as Record<string, unknown>)[settingKey]);
          };
        };
      }),
    {
      databaseName: "MeowvLocalSheets",
      settingKey: key,
    },
  );
}

test("空白工作簿可通过主画布输入文本、数字和公式，并使用快捷键保存", async ({ page }) => {
  test.slow();
  await createBlankWorkbook(page);

  const workbookId = currentWorkbookId(page);
  const mainCanvas = page
    .locator('[aria-label="电子表格编辑区域"] canvas[data-u-comp="render-canvas"]:visible')
    .first();
  await expect(mainCanvas).toBeVisible({ timeout: 20_000 });
  const canvasBox = await mainCanvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(180);
  expect(canvasBox?.height).toBeGreaterThan(120);

  // Univer 默认行表头宽 46px、列表头高 24px，以下位置位于 A1 单元格中心。
  await mainCanvas.click({ position: { x: 90, y: 36 } });
  for (const value of ["Revenue", "10", "20", "=SUM(A2:A3)"]) {
    await page.keyboard.type(value);
    await page.keyboard.press("Enter");
  }

  await page.keyboard.press("ControlOrMeta+S");
  await expect(page.getByRole("status").filter({ hasText: "已保存到当前浏览器" })).toBeVisible();

  await expect
    .poll(async () => (await readPersistedWorkbookFacts(page, workbookId))?.a1)
    .toBe("Revenue");
  await expect.poll(async () => (await readPersistedWorkbookFacts(page, workbookId))?.a2).toBe(10);
  await expect.poll(async () => (await readPersistedWorkbookFacts(page, workbookId))?.a3).toBe(20);
  await expect
    .poll(async () => (await readPersistedWorkbookFacts(page, workbookId))?.a4Formula)
    .toBe("=SUM(A2:A3)");

  await page.reload();
  await expect(page.getByLabel("工作簿名称")).toHaveValue(BLANK_WORKBOOK_NAME);
  await expect(
    page
      .getByRole("tablist", { name: "Sheet tabs" })
      .getByRole("tab", { name: "Sheet1", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const restored = await readPersistedWorkbookFacts(page, workbookId);
  expect(restored).toMatchObject({
    name: BLANK_WORKBOOK_NAME,
    sheetNames: ["Sheet1"],
    a1: "Revenue",
    a2: 10,
    a3: 20,
    a4Formula: "=SUM(A2:A3)",
  });
});

test("空白工作簿可导出为本地 XLSX 文件", async ({ page }) => {
  await createBlankWorkbook(page);

  await page.getByRole("button", { name: "导出", exact: true }).click();
  const warningDialog = page.getByRole("dialog", { name: "导出 XLSX 前请确认" });
  await expect(warningDialog).toBeVisible();
  await expect(warningDialog).toContainText("数据验证、条件格式、筛选设置、绘图与图片");

  const downloadPromise = page.waitForEvent("download");
  await warningDialog.getByRole("button", { name: "继续导出 XLSX" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(`${BLANK_WORKBOOK_NAME}.xlsx`);
  await expect(download.failure()).resolves.toBeNull();
  await expect(download.path()).resolves.not.toBeNull();
});

test("可导入包含两个 Sheet、合并单元格和自定义行列尺寸的 XLSX", async ({ page }) => {
  test.slow();
  await page.goto("/");

  await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles({
    name: MULTI_SHEET_FIXTURE_NAME,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: createMultiSheetXlsxFixture(),
  });

  const compatibilityDialog = page.getByRole("dialog", {
    name: "文件已导入，部分内容可能有差异",
  });
  await expect(compatibilityDialog).toBeVisible({ timeout: 20_000 });
  await expect(compatibilityDialog).toContainText(MULTI_SHEET_FIXTURE_NAME);
  await compatibilityDialog.getByRole("button", { name: "打开工作簿" }).click();

  await expect(page).toHaveURL(/\/workbook\/[^/]+$/);
  const sheetTabs = page.getByRole("tablist", { name: "Sheet tabs" });
  await expect(sheetTabs).toBeVisible({ timeout: 20_000 });
  await expect(sheetTabs.getByRole("tab", { name: "汇总", exact: true })).toBeVisible();
  await expect(sheetTabs.getByRole("tab", { name: "明细", exact: true })).toBeVisible();

  const workbookId = currentWorkbookId(page);
  await expect
    .poll(async () => (await readPersistedWorkbookFacts(page, workbookId))?.sheetNames)
    .toEqual(["汇总", "明细"]);
  const imported = await readPersistedWorkbookFacts(page, workbookId);
  expect(imported?.mergeData).toContainEqual({
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 2,
  });
  expect(imported?.firstRowHeight).toBe(34);
  expect(imported?.firstColumnWidth).toBe(180);
});

test("预算示例可创建、重命名、创建版本，并在刷新后从本地恢复", async ({ page }) => {
  test.slow();
  await createBudgetExample(page);
  await expectBudgetSheets(page);

  const workbookName = page.getByLabel("工作簿名称");
  await workbookName.fill(RENAMED_BUDGET_NAME);
  await workbookName.press("Enter");
  await expect(workbookName).toHaveValue(RENAMED_BUDGET_NAME);
  await expect(page.getByRole("status").filter({ hasText: "工作簿已重命名" })).toBeVisible();

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "创建本地版本" }).click();
  await expect(page.getByRole("status").filter({ hasText: "本地版本已创建" })).toBeVisible();

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "历史版本" }).click();
  const historyDialog = page.getByRole("dialog", { name: "历史版本" });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.locator(".history-item").filter({ hasText: "手动创建" })).toHaveCount(
    1,
  );
  await expect(historyDialog.getByText(/^手动版本 ·/)).toBeVisible();
  await historyDialog.getByRole("button", { name: "关闭", exact: true }).click();

  const workbookUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(workbookUrl);
  await expect(page.getByLabel("工作簿名称")).toHaveValue(RENAMED_BUDGET_NAME);
  await expectBudgetSheets(page);

  await page.getByRole("button", { name: "返回工作簿首页" }).click();
  await expect(page).toHaveURL("/");
  await expect(workbookCard(page, RENAMED_BUDGET_NAME)).toBeVisible();
  await workbookCard(page, RENAMED_BUDGET_NAME)
    .getByRole("button", { name: `打开 ${RENAMED_BUDGET_NAME}` })
    .click();
  await expect(page.getByLabel("工作簿名称")).toHaveValue(RENAMED_BUDGET_NAME);
});

test("设置页核心偏好会写入当前浏览器并在刷新后保留", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "编辑与保存" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "历史版本" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本地数据" })).toBeVisible();
  await expect(page.getByText("所有导入、编辑和导出均在当前设备完成")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出备份" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择备份" })).toBeVisible();

  const lightTheme = page.getByRole("button", { name: /浅色/ });
  await lightTheme.click();
  await expect(lightTheme).toHaveAttribute("aria-pressed", "true");

  const formulaBarSwitch = settingRow(page, "显示公式栏").getByRole("switch");
  await expect(formulaBarSwitch).toHaveAttribute("aria-checked", "true");
  await formulaBarSwitch.click();
  await expect(formulaBarSwitch).toHaveAttribute("aria-checked", "false");

  await settingRow(page, "默认字号").locator("select").selectOption("14");
  await settingRow(page, "自动版本数量").locator("select").selectOption("30");

  await expect.poll(() => readPersistedSetting(page, "theme")).toBe("light");
  await expect.poll(() => readPersistedSetting(page, "showFormulaBar")).toBe(false);
  await expect.poll(() => readPersistedSetting(page, "defaultFontSize")).toBe(14);
  await expect.poll(() => readPersistedSetting(page, "maxAutoRevisions")).toBe(30);

  await page.reload();
  await expect(page.getByRole("button", { name: /浅色/ })).toHaveAttribute("aria-pressed", "true");
  await expect(settingRow(page, "显示公式栏").getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(settingRow(page, "默认字号").locator("select")).toHaveValue("14");
  await expect(settingRow(page, "自动版本数量").locator("select")).toHaveValue("30");
});

test("工作簿可移入回收站、恢复并彻底删除", async ({ page }) => {
  test.slow();
  await createBudgetExample(page);
  await page.getByRole("button", { name: "返回工作簿首页" }).click();
  await expect(page).toHaveURL("/");

  let card = workbookCard(page, BUDGET_NAME);
  await card.getByRole("button", { name: "删除", exact: true }).click();
  let dialog = page.getByRole("alertdialog", { name: "移入回收站？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "移入回收站" }).click();
  await expect(card).toHaveCount(0);

  await page.getByRole("tab", { name: /回收站/ }).click();
  card = workbookCard(page, BUDGET_NAME);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "工作簿已恢复" })).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole("tab", { name: "最近使用", exact: true }).click();
  card = workbookCard(page, BUDGET_NAME);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "删除", exact: true }).click();
  dialog = page.getByRole("alertdialog", { name: "移入回收站？" });
  await dialog.getByRole("button", { name: "移入回收站" }).click();

  await page.getByRole("tab", { name: /回收站/ }).click();
  card = workbookCard(page, BUDGET_NAME);
  await card.getByRole("button", { name: "彻底删除" }).click();
  dialog = page.getByRole("alertdialog", { name: "彻底删除工作簿？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "彻底删除" }).click();
  await expect(page.getByRole("heading", { name: "回收站是空的" })).toBeVisible();
});
