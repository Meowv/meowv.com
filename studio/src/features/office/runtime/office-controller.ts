import { setDocmentObj } from '@ranuts/shared/store';
import { handleDocumentOperation, initX2T, loadEditorApi } from './lib/converter';
import { editorSession, saveCurrentDocument } from './lib/editor-session';
import { releaseOnlyOfficeSessionResources } from './lib/onlyoffice-editor';
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

function fileExtension(fileName: string): OfficeFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return OFFICE_FORMATS.includes(extension as OfficeFormat) ? (extension as OfficeFormat) : null;
}

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
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
    onStage?: (message: string) => void;
  } = {},
): Promise<void> {
  const extension = fileExtension(file.name);
  if (!extension) throw new Error('仅支持 DOCX、XLSX、PPTX 与 CSV 文件。');

  const objectUrl = createObjectUrl(file);
  editorSession.begin(file.name, objectUrl, false, options.handle);
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
): Promise<void> {
  if (format === 'csv') {
    const csv = new File(['项目,状态\r\nStudio,待编辑\r\n'], '新建表格.csv', {
      type: 'text/csv;charset=utf-8',
    });
    await openOfficeFile(csv, { onStage });
    return;
  }

  const names: Record<Exclude<OfficeFormat, 'csv'>, string> = {
    docx: '新建文档.docx',
    xlsx: '新建工作簿.xlsx',
    pptx: '新建演示文稿.pptx',
  };
  const fileName = names[format];
  // 新建文件在首次保存并获得可复用的本地句柄后才会进入历史记录。
  editorSession.begin(fileName);
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
