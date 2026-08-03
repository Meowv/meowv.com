export interface BrowserCapabilities {
  fileSystemAccess: boolean;
  indexedDb: boolean;
  offscreenCanvas: boolean;
  webWorkers: boolean;
  webAssembly: boolean;
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  return {
    fileSystemAccess: typeof window.showOpenFilePicker === 'function',
    indexedDb: 'indexedDB' in window,
    offscreenCanvas: 'OffscreenCanvas' in window,
    webWorkers: 'Worker' in window,
    webAssembly: 'WebAssembly' in window,
  };
}
