import { createObjectURL } from 'ranuts/utils';
import { View } from 'ranui/builder';
import { getDocmentObj, setDocmentObj } from '@ranuts/shared/store';
import { handleDocumentOperation, initX2T, loadEditorApi, loadScript } from './converter';
import { showLoading } from './loading';
import { editorSession } from './editor-session';
import {
  createRecentDocument,
  getRecentDocumentId,
  rememberRecentDocument,
  type StoredFileHandle,
} from './recent-documents';

// Import UI functions with type-only to avoid circular dependency
// These will be passed as callbacks or called after document operations
let hideControlPanelFn: (() => void) | null = null;
let showControlPanelFn: (() => void) | null = null;
let showMenuGuideFn: (() => void) | null = null;

export function setUICallbacks(callbacks: {
  hideControlPanel: () => void;
  showControlPanel: () => void;
  showMenuGuide: () => void;
}): void {
  hideControlPanelFn = callbacks.hideControlPanel;
  showControlPanelFn = callbacks.showControlPanel;
  showMenuGuideFn = callbacks.showMenuGuide;
}

// Create a single hidden file input (ranui builder, ecosystem convention)
const fileInput = View('input')
  .attr('type', 'file')
  .attr('accept', '.docx,.xlsx,.pptx,.doc,.xls,.ppt,.csv')
  .attr('style', 'visibility: hidden')
  .build() as HTMLInputElement;
document.body.appendChild(fileInput);

export const onCreateNew = async (ext: string): Promise<void> => {
  // Note: Loading is now shown in the menu button click handler
  // This function should not show loading again to avoid double loading indicators
  try {
    // Always hide control panel and ensure FAB is visible when creating new document
    if (hideControlPanelFn) {
      hideControlPanelFn();
    }
    const defaultNames: Record<string, string> = {
      '.docx': '新建文档.docx',
      '.xlsx': '新建 Excel.xlsx',
      '.pptx': '新建 PPT.pptx',
    };
    const fileName = defaultNames[ext.toLowerCase()] || `新建文件${ext}`;
    const recentDocumentId = await createRecentDocument(fileName);
    editorSession.begin(fileName, undefined, false, undefined, recentDocumentId);
    setDocmentObj({
      fileName,
      file: undefined,
    });
    await loadScript();
    await loadEditorApi();
    await initX2T();
    const { fileName: currentFileName, file: fileBlob } = getDocmentObj();
    await handleDocumentOperation({ file: fileBlob, fileName: currentFileName, isNew: !fileBlob });
    // Show menu guide after document is loaded
    if (showMenuGuideFn) {
      setTimeout(() => {
        showMenuGuideFn!();
      }, 1000);
    }
  } catch (error) {
    console.error('Error creating new document:', error);
    // Ensure control panel is shown on error
    if (showControlPanelFn) {
      showControlPanelFn();
    }
    throw error; // Re-throw to let the menu button handler catch it
  }
};

// Open an already-picked local File from the file input or a browser file handle.
export const openLocalFile = async (file: File, handle?: StoredFileHandle): Promise<void> => {
  const { removeLoading } = showLoading();
  try {
    if (hideControlPanelFn) {
      hideControlPanelFn();
    }
    const objectUrl = await createObjectURL(file);
    editorSession.begin(file.name, objectUrl, false, handle, getRecentDocumentId(file));
    setDocmentObj({
      fileName: file.name,
      file: file,
      url: objectUrl,
    });
    await loadScript();
    await loadEditorApi();
    await initX2T();
    const { fileName, file: fileBlob } = getDocmentObj();
    await handleDocumentOperation({ file: fileBlob, fileName, isNew: !fileBlob });
    void rememberRecentDocument(file, handle);
    // Show menu guide after document is loaded
    if (showMenuGuideFn) {
      setTimeout(() => {
        showMenuGuideFn!();
      }, 1000);
    }
  } catch (error) {
    console.error('Error opening document:', error);
    // Ensure control panel is shown on error
    if (showControlPanelFn) {
      showControlPanelFn();
    }
  } finally {
    // Always remove loading, even if there's an error
    removeLoading();
  }
};

export const onOpenDocument = (extension?: '.docx' | '.xlsx' | '.pptx' | '.csv'): void => {
  type PickerType = { description: string; accept: Record<string, string[]> };
  const typesByExtension: Record<NonNullable<typeof extension>, PickerType> = {
    '.docx': {
      description: 'Word 文档',
      accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    },
    '.xlsx': {
      description: 'Excel 表格',
      accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    },
    '.pptx': {
      description: 'PowerPoint 演示文稿',
      accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] },
    },
    '.csv': { description: 'CSV 文件', accept: { 'text/csv': ['.csv'] } },
  };
  const types = extension ? [typesByExtension[extension]] : Object.values(typesByExtension);
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options: {
        multiple: boolean;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<StoredFileHandle[]>;
    }
  ).showOpenFilePicker;

  if (picker) {
    void picker({
      multiple: false,
      types,
    })
      .then(async ([handle]) => {
        if (!handle) return;
        await openLocalFile(await handle.getFile(), handle);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name !== 'AbortError') {
          console.error('Failed to choose local document:', error);
        }
      });
    return;
  }

  // Clear previous event handler and value
  fileInput.onchange = null;
  fileInput.value = '';
  fileInput.accept = extension || '.docx,.xlsx,.pptx,.doc,.xls,.ppt,.csv';

  // Define the change handler
  const handleChange = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];

    // Clear the handler to prevent multiple triggers
    fileInput.onchange = null;

    // Only process if a file was actually selected
    // If user cancelled, onchange won't fire, nothing happens
    if (file) {
      await openLocalFile(file);
      // Clear file selection so the same file can be selected again
      fileInput.value = '';
    }
    // If no file selected, nothing happens (user cancelled)
  };

  // Set the change handler
  fileInput.onchange = handleChange;

  // Trigger file picker click event
  fileInput.click();
};

export const openDocumentFromUrl = async (
  url: string,
  fileName?: string,
  options?: {
    readonly?: boolean;
    fetchOptions?: RequestInit;
  },
): Promise<void> => {
  const { removeLoading } = showLoading();
  try {
    const parsedUrl = new URL(url, window.location.href);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('远程地址仅支持 http:// 或 https://');
    }
    if (hideControlPanelFn) {
      hideControlPanelFn();
    }

    // Fetch the file from URL
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(url, options?.fetchOptions);

    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
    }

    // Get file name from URL or Content-Disposition header, or use provided name
    let finalFileName = fileName;
    if (!finalFileName) {
      // Try to get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          finalFileName = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      // If still no filename, extract from URL
      if (!finalFileName) {
        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          finalFileName = pathname.split('/').pop() || 'document';
          // Remove query parameters if any
          finalFileName = finalFileName.split('?')[0];
        } catch {
          finalFileName = 'document';
        }
      }
    }

    // Get file blob
    const blob = await response.blob();
    const file = new File([blob], finalFileName, { type: blob.type });

    // Set document object
    const objectUrl = await createObjectURL(file);
    editorSession.begin(finalFileName, objectUrl, options?.readonly);
    setDocmentObj({
      fileName: finalFileName,
      file: file,
      url: objectUrl,
    });

    // Initialize and open document
    await loadScript();
    await loadEditorApi();
    await initX2T();
    const { fileName: docFileName, file: fileBlob } = getDocmentObj();
    await handleDocumentOperation({
      file: fileBlob,
      fileName: docFileName,
      isNew: !fileBlob,
      readonly: options?.readonly,
    });

    // Show menu guide after document is loaded
    if (showMenuGuideFn) {
      setTimeout(() => {
        showMenuGuideFn!();
      }, 1000);
    }
  } catch (error) {
    console.error('Error opening document from URL:', error);
    alert(`Failed to open document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (showControlPanelFn) {
      showControlPanelFn();
    }
  } finally {
    removeLoading();
  }
};
