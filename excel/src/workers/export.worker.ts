import { utils, write } from "xlsx";

import { workbookSnapshotToJsonBuffer } from "../adapters/json";
import { normalizedToSheetJs } from "../adapters/sheetjs";
import type {
  ExportFileType,
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerStage,
} from "../types/worker";

interface WorkerEndpoint {
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
  postMessage(message: ExportWorkerResponse, transfer?: Transferable[]): void;
}

const endpoint = globalThis as unknown as WorkerEndpoint;

const MIME_TYPES: Record<ExportFileType, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  msheet: "application/x-meowv-sheet+json",
};

function progress(stage: ExportWorkerStage, message: string, percent: number): void {
  endpoint.postMessage({
    type: "progress",
    progress: { stage, message, percent },
  });
}

function encodeText(value: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(value);
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return copy.buffer;
}

function toArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return copy.buffer;
  }
  throw new Error("SheetJS 返回了无法识别的文件数据。");
}

function exportXlsx(request: ExportWorkerRequest): ArrayBuffer {
  if (!request.workbook) {
    throw new Error("缺少待导出的工作簿数据。");
  }

  progress("converting", "正在转换为 XLSX 工作簿", 48);
  const workbook = normalizedToSheetJs(request.workbook);
  progress("encoding", "正在生成 XLSX 文件", 78);
  const output: unknown = write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
    cellStyles: true,
  });
  return toArrayBuffer(output);
}

function exportCsv(request: ExportWorkerRequest): ArrayBuffer {
  if (!request.workbook) {
    throw new Error("缺少待导出的工作簿数据。");
  }

  const selectedSheet =
    request.workbook.sheets.find((sheet) => sheet.id === request.sheetId) ??
    request.workbook.sheets.find((sheet) => sheet.id === request.workbook?.activeSheetId) ??
    request.workbook.sheets[0];
  if (!selectedSheet) {
    throw new Error("工作簿中没有可导出的 Sheet。");
  }

  progress("converting", `正在转换“${selectedSheet.name}”`, 55);
  const workbook = normalizedToSheetJs({
    ...request.workbook,
    sheets: [selectedSheet],
    activeSheetId: selectedSheet.id,
  });
  const worksheet = workbook.Sheets[selectedSheet.name];
  if (!worksheet) {
    throw new Error("无法创建 CSV 工作表。");
  }

  progress("encoding", "正在生成 CSV 文件", 82);
  const csv = utils.sheet_to_csv(worksheet, {
    blankrows: true,
    forceQuotes: false,
  });
  // BOM 让 Windows 上的桌面表格软件可靠识别 UTF-8 中文。
  return encodeText(`\uFEFF${csv}`);
}

function exportJson(request: ExportWorkerRequest): ArrayBuffer {
  if (!request.snapshot) {
    throw new Error("缺少待导出的工作簿快照。");
  }
  progress("encoding", "正在生成 JSON 文件", 75);
  return workbookSnapshotToJsonBuffer(request.snapshot);
}

function exportBackup(request: ExportWorkerRequest): ArrayBuffer {
  if (!request.backup) {
    throw new Error("缺少待导出的备份数据。");
  }
  progress("encoding", "正在生成完整备份", 75);
  return encodeText(JSON.stringify(request.backup));
}

function createOutput(request: ExportWorkerRequest): ArrayBuffer {
  switch (request.format) {
    case "xlsx":
      return exportXlsx(request);
    case "csv":
      return exportCsv(request);
    case "json":
      return exportJson(request);
    case "msheet":
      return exportBackup(request);
  }
}

function messageForError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "导出文件失败。";
}

endpoint.onmessage = (event): void => {
  const request = event.data;
  if (request.type !== "export") {
    return;
  }

  try {
    progress("normalizing", "正在准备最新工作簿数据", 15);
    const buffer = createOutput(request);
    progress("complete", "文件生成完成", 100);
    endpoint.postMessage(
      {
        type: "success",
        buffer,
        mimeType: MIME_TYPES[request.format],
        extension: request.format,
      },
      [buffer],
    );
  } catch (error) {
    endpoint.postMessage({
      type: "error",
      message: messageForError(error),
      details: error instanceof Error ? error.stack : undefined,
    });
  }
};
