import { getDocmentObj, setDocmentObj } from '@ranuts/shared/store';
import { updateActiveOfficeSnapshot, type OfficeRouteFormat } from './active-documents';
import {
  markRecentDocumentSaved,
  rememberRecentDocument,
  type StoredFileHandle,
} from './recent-documents';

const INVALID_FILE_NAME = /[<>:"/\\|?*]|\p{Cc}/gu;

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() || 'DOCX';
}

function safeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(INVALID_FILE_NAME, '_')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned || '未命名文档.docx';
}

function fileWithHandleName(file: File, handle?: StoredFileHandle): File {
  const fileName = handle?.name ? safeFileName(handle.name) : file.name;
  if (fileName === file.name) return file;
  return new File([file], fileName, { type: file.type, lastModified: file.lastModified });
}

async function saveFileLocally(
  file: File,
  currentHandle?: StoredFileHandle,
  allowSavePicker = true,
): Promise<StoredFileHandle | undefined> {
  if (currentHandle?.createWritable) {
    const currentPermission = await currentHandle.queryPermission?.({ mode: 'readwrite' });
    const permission =
      currentPermission === 'granted'
        ? currentPermission
        : allowSavePicker
          ? await currentHandle.requestPermission?.({ mode: 'readwrite' })
          : currentPermission;
    if (permission === 'granted') {
      const writable = await currentHandle.createWritable();
      await writable.write(file);
      await writable.close();
      return currentHandle;
    }
    if (!allowSavePicker) {
      throw new Error('本地文件写入权限已取消，请从编辑器中手动保存。');
    }
    throw new Error('需要原文件的写入权限才能保存。');
  }

  const picker = (
    window as unknown as {
      showSaveFilePicker?: (options: unknown) => Promise<{
        name: string;
        createWritable: () => Promise<{
          write: (data: File) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;

  if (picker) {
    const extension = `.${getFileExtension(file.name).toLowerCase()}`;
    const handle = await picker({
      suggestedName: safeFileName(file.name),
      types: [
        {
          description: 'Office 文档',
          accept: { [file.type || 'application/octet-stream']: [extension] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return handle as StoredFileHandle;
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName(file.name);
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return undefined;
}

class EditorSession {
  private dirty = false;
  private readonlyMode = false;
  private objectUrls = new Set<string>();
  private fileHandle: StoredFileHandle | undefined;
  private recentDocumentId: string | undefined;
  private activeRouteFormat: OfficeRouteFormat | undefined;
  private autosaveTimer: number | undefined;
  private saveInFlight: Promise<void> | null = null;
  private autosaveDisabled = false;

  constructor() {
    window.addEventListener('beforeunload', (event) => {
      if (!this.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  begin(
    fileName: string,
    objectUrl?: string | URL,
    readonly = false,
    fileHandle?: StoredFileHandle,
    recentDocumentId?: string,
    activeRouteFormat?: OfficeRouteFormat,
  ): void {
    this.releaseObjectUrls();
    if (objectUrl) this.objectUrls.add(String(objectUrl));
    this.dirty = false;
    this.readonlyMode = readonly;
    this.fileHandle = fileHandle;
    this.recentDocumentId = recentDocumentId;
    this.activeRouteFormat = activeRouteFormat;
    this.autosaveDisabled = false;
    this.updateWorkspace(fileName, readonly ? '只读' : '正在加载…');
  }

  markReady(): void {
    this.updateStatus(this.readonlyMode ? '只读' : '已打开');
  }

  setRecentDocumentId(id?: string): void {
    this.recentDocumentId = id;
  }

  markDirty(): void {
    if (this.readonlyMode) return;
    this.dirty = true;
    this.updateStatus(
      (this.fileHandle?.createWritable || this.activeRouteFormat) && !this.autosaveDisabled
        ? '正在准备自动保存…'
        : '未保存',
    );
    this.scheduleAutoSave();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  markSaving(): void {
    this.updateStatus('正在保存…');
  }

  markSaved(isAutomatic = false): void {
    this.dirty = false;
    this.updateStatus(
      this.fileHandle?.createWritable
        ? '已保存到原文件'
        : isAutomatic && this.activeRouteFormat
          ? '已自动保存到浏览器'
          : '已导出到本地',
    );
  }

  markSaveFailed(): void {
    this.autosaveDisabled = true;
    this.updateStatus(this.dirty ? '未保存' : '保存失败');
  }

  returnHome(): void {
    if (this.dirty && !window.confirm('当前文档有未保存修改，确定返回首页吗？')) return;
    this.dispose();
    window.location.assign('/');
  }

  dispose(): void {
    try {
      window.editor?.destroyEditor();
    } catch {
      // 编辑器可能尚未完成初始化，继续释放其余资源。
    }
    window.editor = undefined;
    this.releaseObjectUrls();
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
    this.fileHandle = undefined;
    this.recentDocumentId = undefined;
    this.activeRouteFormat = undefined;
    this.dirty = false;
    document.body.classList.remove('workspace-active');
    setDocmentObj({ fileName: '', file: undefined, url: undefined });
  }

  private releaseObjectUrls(): void {
    for (const url of this.objectUrls) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }

  private updateWorkspace(fileName: string, status: string): void {
    document.body.classList.add('workspace-active');
    const input = document.getElementById('workspace-file-name') as HTMLInputElement | null;
    if (input) input.value = fileName;
    this.updateStatus(status);
  }

  private updateStatus(status: string): void {
    const statusElement = document.getElementById('workspace-status');
    if (statusElement) statusElement.textContent = status;
  }

  private scheduleAutoSave(): void {
    if (
      this.readonlyMode ||
      this.autosaveDisabled ||
      (!this.fileHandle?.createWritable && !this.activeRouteFormat)
    )
      return;
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = undefined;
      void this.saveToOriginalFile();
    }, 1200);
  }

  private async saveToOriginalFile(): Promise<void> {
    if (!this.dirty || this.saveInFlight) return;
    this.saveInFlight = saveCurrentDocument(true);
    try {
      await this.saveInFlight;
    } finally {
      this.saveInFlight = null;
      if (this.dirty) this.scheduleAutoSave();
    }
  }

  async saveExportedFile(file: File, allowSavePicker = true): Promise<void> {
    const handle = await saveFileLocally(file, this.fileHandle, allowSavePicker);
    if (handle) this.fileHandle = handle;
    const savedFile = fileWithHandleName(file, this.fileHandle);
    if (this.activeRouteFormat) {
      await updateActiveOfficeSnapshot(this.activeRouteFormat, savedFile, this.fileHandle);
    }
    if (this.recentDocumentId) {
      await markRecentDocumentSaved(this.recentDocumentId, savedFile, this.fileHandle);
      return;
    }
    this.recentDocumentId = await rememberRecentDocument(savedFile, this.fileHandle);
  }

  async saveAutomaticFile(file: File): Promise<void> {
    if (this.fileHandle?.createWritable) {
      await this.saveExportedFile(file, false);
      return;
    }
    if (!this.activeRouteFormat) throw new Error('当前文档没有可用的自动保存位置');
    await updateActiveOfficeSnapshot(this.activeRouteFormat, file);
  }

  async saveFromEditor(file: File): Promise<void> {
    this.markSaving();
    try {
      await this.saveExportedFile(file);
      this.markSaved();
    } catch (error) {
      this.markSaveFailed();
      throw error;
    }
  }
}

export const editorSession = new EditorSession();

let requestSave: ((targetExt: string) => Promise<File>) | null = null;

export function setSaveRequestHandler(handler: (targetExt: string) => Promise<File>): void {
  requestSave = handler;
}

export async function saveCurrentDocument(isAutomatic = false): Promise<void> {
  const documentState = getDocmentObj();
  if (!documentState.fileName || !window.editor) return;

  editorSession.markSaving();
  try {
    if (!requestSave) throw new Error('保存组件尚未就绪');
    const saved = await requestSave(getFileExtension(documentState.fileName));
    const renamed = new File([saved], safeFileName(documentState.fileName), { type: saved.type });
    if (isAutomatic) await editorSession.saveAutomaticFile(renamed);
    else await editorSession.saveExportedFile(renamed);
    editorSession.markSaved(isAutomatic);
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('保存失败：', error);
      if (!isAutomatic) {
        window.alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
    editorSession.markSaveFailed();
  }
}
