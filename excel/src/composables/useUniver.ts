import {
  CommandType,
  IImageIoService,
  LocaleType,
  createUniver,
  greenTheme,
  mergeLocales,
  type FUniver,
  type IDisposable,
  type IWorkbookData,
  type Univer,
} from "@univerjs/presets";
import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import conditionalFormattingZhCN from "@univerjs/preset-sheets-conditional-formatting/locales/zh-CN";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import dataValidationZhCN from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import {
  UniverDocsDrawingPlugin,
  UniverDrawingPlugin,
  UniverDrawingUIPlugin,
  UniverSheetsDrawingPlugin,
  UniverSheetsDrawingUIPlugin,
} from "@univerjs/preset-sheets-drawing";
import drawingZhCN from "@univerjs/preset-sheets-drawing/locales/zh-CN";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import filterZhCN from "@univerjs/preset-sheets-filter/locales/zh-CN";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import findReplaceZhCN from "@univerjs/preset-sheets-find-replace/locales/zh-CN";
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note";
import noteZhCN from "@univerjs/preset-sheets-note/locales/zh-CN";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import sortZhCN from "@univerjs/preset-sheets-sort/locales/zh-CN";

import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-note/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";

import { LocalImageIoService } from "@/services/univer-image-io.service";

export interface UniverEditorOptions {
  container: HTMLElement;
  snapshot: IWorkbookData;
  darkMode?: boolean;
  showFormulaBar?: boolean;
  showStatusBar?: boolean;
  onMutation?: () => void;
}

export interface UniverEditorController {
  api: FUniver;
  getSnapshot: () => IWorkbookData;
  setDarkMode: (enabled: boolean) => void;
  dispose: () => void;
}

const appTheme = {
  ...greenTheme,
  primary: {
    ...greenTheme.primary,
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
  },
};

/**
 * Univer 实例保持为普通局部变量，避免 Vue 深层响应式代理破坏其内部依赖注入对象。
 */
export function useUniver(options: UniverEditorOptions): UniverEditorController {
  let univer: Univer | null = null;
  let univerAPI: FUniver | null = null;
  let mutationSubscription: IDisposable | null = null;
  const imageIoService = new LocalImageIoService(options.snapshot.id);
  let disposed = false;

  const runtime = createUniver({
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: mergeLocales(
        sheetsCoreZhCN,
        dataValidationZhCN,
        conditionalFormattingZhCN,
        drawingZhCN,
        filterZhCN,
        findReplaceZhCN,
        noteZhCN,
        sortZhCN,
      ),
    },
    theme: appTheme,
    presets: [
      UniverSheetsCorePreset({
        container: options.container,
        header: true,
        toolbar: true,
        formulaBar: options.showFormulaBar ?? true,
        footer:
          options.showStatusBar === false
            ? false
            : {
                sheetBar: true,
                statisticBar: true,
                menus: true,
                zoomSlider: true,
              },
        statusBarStatistic: options.showStatusBar ?? true,
        contextMenu: true,
        sheets: {
          freezeSync: false,
          autoHeightForMergedCells: true,
        },
      }),
      UniverSheetsDataValidationPreset(),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsFilterPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsNotePreset(),
      UniverSheetsSortPreset(),
    ],
    plugins: [
      [
        UniverDrawingPlugin,
        {
          override: [[IImageIoService, { useValue: imageIoService }]],
        },
      ],
      UniverDocsDrawingPlugin,
      UniverDrawingUIPlugin,
      UniverSheetsDrawingPlugin,
      UniverSheetsDrawingUIPlugin,
    ],
  });

  univer = runtime.univer;
  univerAPI = runtime.univerAPI;
  univerAPI.toggleDarkMode(Boolean(options.darkMode));
  univerAPI.createWorkbook(options.snapshot);

  if (options.onMutation) {
    mutationSubscription = univerAPI.addEvent(univerAPI.Event.CommandExecuted, ({ type }) => {
      if (type === CommandType.MUTATION) options.onMutation?.();
    });
  }

  function getSnapshot(): IWorkbookData {
    const workbook = univerAPI?.getActiveWorkbook();
    if (!workbook) throw new Error("当前没有可保存的工作簿");
    return workbook.save();
  }

  function setDarkMode(enabled: boolean) {
    univerAPI?.toggleDarkMode(enabled);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    mutationSubscription?.dispose();
    mutationSubscription = null;
    univerAPI?.dispose();
    univerAPI = null;
    univer?.dispose();
    univer = null;
    imageIoService.dispose();
  }

  return {
    api: runtime.univerAPI,
    getSnapshot,
    setDarkMode,
    dispose,
  };
}
