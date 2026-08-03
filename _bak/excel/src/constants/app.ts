export const APP_NAME = "在线 Excel 处理";
export const APP_DESCRIPTION = "无需登录、数据不上传，在浏览器中创建、编辑和导出Excel文件。";

export const APP_ROUTES = {
  home: "/",
  workbook: "/workbook/:id",
  settings: "/settings",
} as const;

export const WORKBOOK_ROUTE_NAME = "workbook";

export const AUTO_SAVE_DELAY = 1_500;
export const AUTO_SAVE_MAX_WAIT = 5_000;
export const DEFAULT_MAX_AUTO_REVISIONS = 20;
