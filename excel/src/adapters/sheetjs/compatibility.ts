import type { WorkBook } from "xlsx";

import type { CompatibilityIssue, CompatibilityReport } from "../../types/normalized-workbook";

const STYLE_LIMITATION =
  "字体、颜色、边框和对齐仅做尽力转换；SheetJS CE 0.20.3 不保证读取或重新写入这些样式时完全保真。";
const FREEZE_LIMITATION =
  "冻结窗格仅在源文件暴露相关元数据时尽力读取；SheetJS CE 0.20.3 不保证冻结信息可被读取或重新写入。";

function issue(
  code: string,
  feature: string,
  detail: string,
  severity: CompatibilityIssue["severity"] = "warning",
): CompatibilityIssue {
  return { code, feature, detail, severity };
}

function detectIgnoredFeatures(workbook: WorkBook): {
  ignored: string[];
  issues: CompatibilityIssue[];
} {
  const ignored: string[] = [];
  const issues: CompatibilityIssue[] = [];

  if (workbook.vbaraw !== undefined) {
    ignored.push("检测到 VBA 宏数据；导入后不会执行，也不会在普通 .xlsx 导出中保留。");
    issues.push(
      issue(
        "vba-detected",
        "VBA 宏",
        "检测到宏数据。为保证纯前端安全，宏不会执行，导出为 .xlsx 时也不会保留。",
      ),
    );
  }

  if ((workbook.Workbook?.Names?.length ?? 0) > 0) {
    ignored.push("工作簿定义名称不会写入当前标准化模型。");
    issues.push(
      issue(
        "defined-names-ignored",
        "定义名称",
        "检测到工作簿定义名称；当前版本不会保留该元数据。",
      ),
    );
  }

  const hasAutoFilter = workbook.SheetNames.some(
    (sheetName) => workbook.Sheets[sheetName]?.["!autofilter"] !== undefined,
  );
  if (hasAutoFilter) {
    ignored.push("已有自动筛选范围不会写入当前标准化模型。");
    issues.push(
      issue(
        "autofilter-ignored",
        "自动筛选",
        "单元格内容已导入，但源文件中的自动筛选范围需要重新设置。",
      ),
    );
  }

  return { ignored, issues };
}

export function createSheetJsCompatibilityReport(workbook: WorkBook): CompatibilityReport {
  const detected = detectIgnoredFeatures(workbook);
  const issues: CompatibilityIssue[] = [
    issue("sheetjs-ce-style-fidelity", "单元格样式", STYLE_LIMITATION),
    issue("sheetjs-ce-freeze-fidelity", "冻结窗格", FREEZE_LIMITATION),
    issue(
      "advanced-excel-features",
      "高级 Excel 功能",
      "SheetJS CE 无法保证字体、颜色、边框、对齐、冻结、VBA、图表、数据透视表、Power Query、ActiveX、复杂条件格式和外部数据源的完整保留。",
    ),
    ...detected.issues,
  ];

  return {
    engine: "SheetJS CE 0.20.3",
    summary: "文件已打开，但部分高级 Excel 功能可能无法完整保留。",
    preserved: [
      "单元格值和基础类型",
      "公式原文",
      "合并区域",
      "行高、列宽和行列隐藏状态",
      "数字与日期格式代码",
      "工作表名称、顺序和显隐状态",
    ],
    degraded: [
      STYLE_LIMITATION,
      FREEZE_LIMITATION,
      "Very Hidden 工作表在 Univer 中会降级为普通隐藏。",
    ],
    unsupported: [
      "VBA 宏与 ActiveX",
      "复杂图表和特殊对象",
      "数据透视表、Power Query 与外部数据源",
      "复杂条件格式与自定义插件",
      "密码保护或加密文件",
    ],
    ignored: detected.ignored,
    issues,
    hasWarnings: true,
  };
}
