import { setDocmentObj } from '@ranuts/shared/store';
import { handleDocumentOperation, initX2T, loadEditorApi } from './lib/converter';
import { editorSession, saveCurrentDocument } from './lib/editor-session';
import { releaseOnlyOfficeSessionResources } from './lib/onlyoffice-editor';
import {
  getActiveOfficeDocument,
  replaceActiveOfficeDocument,
  type OfficeRouteFormat,
} from './lib/active-documents';
import {
  deleteRecentDocument,
  getRecentDocumentFile,
  listRecentDocuments,
  rememberRecentDocument,
  type RecentDocument,
  type StoredFileHandle,
} from './lib/recent-documents';

export type OfficeFormat = 'docx' | 'xlsx' | 'pptx' | 'csv';

export const OFFICE_FORMATS: OfficeFormat[] = ['docx', 'xlsx', 'pptx', 'csv'];

export const OFFICE_ROUTE_FORMATS: OfficeRouteFormat[] = ['doc', 'xls', 'ppt', 'csv'];

const ROUTE_TO_OFFICE_FORMAT: Record<OfficeRouteFormat, OfficeFormat> = {
  doc: 'docx',
  xls: 'xlsx',
  ppt: 'pptx',
  csv: 'csv',
};

const OFFICE_TO_ROUTE_FORMAT: Record<OfficeFormat, OfficeRouteFormat> = {
  docx: 'doc',
  xlsx: 'xls',
  pptx: 'ppt',
  csv: 'csv',
};

function fileExtension(fileName: string): OfficeFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return OFFICE_FORMATS.includes(extension as OfficeFormat) ? (extension as OfficeFormat) : null;
}

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function officeFormatForRoute(routeFormat: OfficeRouteFormat): OfficeFormat {
  return ROUTE_TO_OFFICE_FORMAT[routeFormat];
}

export function routeFormatForFileName(fileName: string): OfficeRouteFormat | null {
  const extension = fileExtension(fileName);
  return extension ? OFFICE_TO_ROUTE_FORMAT[extension] : null;
}

async function prepareRuntime(onStage?: (message: string) => void): Promise<void> {
  onStage?.('正在载入本地编辑器…');
  await loadEditorApi();
  onStage?.('正在初始化文档转换器…');
  await initX2T();
}

export async function openOfficeFile(
  file: File,
  options: {
    handle?: StoredFileHandle;
    routeFormat?: OfficeRouteFormat;
    onStage?: (message: string) => void;
  } = {},
): Promise<void> {
  const extension = fileExtension(file.name);
  if (!extension) throw new Error('仅支持 DOCX、XLSX、PPTX 与 CSV 文件。');

  if (options.routeFormat) {
    await replaceActiveOfficeDocument(options.routeFormat, file, options.handle);
  }
  const objectUrl = createObjectUrl(file);
  editorSession.begin(file.name, objectUrl, false, options.handle, undefined, options.routeFormat);
  setDocmentObj({ fileName: file.name, file, url: objectUrl });

  try {
    await prepareRuntime(options.onStage);
    options.onStage?.(`正在打开 ${file.name}…`);
    await handleDocumentOperation({ isNew: false, fileName: file.name, file });
    editorSession.setRecentDocumentId(await rememberRecentDocument(file, options.handle));
  } catch (error) {
    editorSession.dispose();
    throw error;
  }
}

export async function createOfficeDocument(
  format: OfficeFormat,
  onStage?: (message: string) => void,
  routeFormat?: OfficeRouteFormat,
): Promise<void> {
  if (format === 'csv') {
    const csv = new File(['项目,状态\r\nStudio,待编辑\r\n'], '新建表格.csv', {
      type: 'text/csv;charset=utf-8',
    });
    await openOfficeFile(csv, { onStage, routeFormat });
    return;
  }

  const names: Record<Exclude<OfficeFormat, 'csv'>, string> = {
    docx: '新建文档.docx',
    xlsx: '新建工作簿.xlsx',
    pptx: '新建演示文稿.pptx',
  };
  const fileName = names[format];
  // 新建文件在首次保存并获得可复用的本地句柄后才会进入历史记录。
  editorSession.begin(fileName, undefined, false, undefined, undefined, routeFormat);
  setDocmentObj({ fileName, file: undefined });

  try {
    await prepareRuntime(onStage);
    onStage?.(`正在创建 ${fileName}…`);
    await handleDocumentOperation({ isNew: true, fileName });
  } catch (error) {
    editorSession.dispose();
    throw error;
  }
}

export async function saveOfficeDocument(): Promise<void> {
  await saveCurrentDocument();
}

export function hasUnsavedOfficeChanges(): boolean {
  return editorSession.hasUnsavedChanges();
}

export async function loadRecentOfficeDocuments(): Promise<RecentDocument[]> {
  return listRecentDocuments();
}

export async function loadActiveOfficeFile(
  routeFormat: OfficeRouteFormat,
): Promise<{ file: File; handle?: StoredFileHandle } | null> {
  const activeDocument = await getActiveOfficeDocument(routeFormat);
  if (!activeDocument) return null;

  if (activeDocument.handle) {
    try {
      const permission = await activeDocument.handle.queryPermission?.({ mode: 'readwrite' });
      if (!permission || permission === 'granted') {
        return { file: await activeDocument.handle.getFile(), handle: activeDocument.handle };
      }
    } catch {
      // 授权失效时仍可从浏览器内的最新快照恢复内容。
    }
  }

  return {
    file: activeDocument.file,
    ...(activeDocument.handle ? { handle: activeDocument.handle } : {}),
  };
}

export async function loadRecentOfficeFile(
  record: RecentDocument,
): Promise<{ file: File; handle?: StoredFileHandle }> {
  const file = await getRecentDocumentFile(record);
  if (!file) throw new Error('本地文件访问权限不可用。');
  return { file, ...(record.handle ? { handle: record.handle } : {}) };
}

export async function openRecentOfficeDocument(
  record: RecentDocument,
  onStage?: (message: string) => void,
): Promise<void> {
  const file = await getRecentDocumentFile(record);
  if (!file) throw new Error('本地文件访问权限不可用。');
  await openOfficeFile(file, { handle: record.handle, onStage });
}

export async function deleteOfficeRecentDocument(id: string): Promise<void> {
  await deleteRecentDocument(id);
}

export function disposeOfficeRuntime(): void {
  editorSession.dispose();
  releaseOnlyOfficeSessionResources();
}
