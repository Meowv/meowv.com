export type ToolMode = 'compress' | 'convert' | 'resize';

export type TaskStatus = 'ready' | 'processing' | 'success' | 'failed' | 'cancelled';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface SourceRect extends ImageDimensions {
  x: number;
  y: number;
}

export interface ImageResult extends ImageDimensions {
  blob: Blob;
  filename: string;
  mime: string;
}

export interface ImageTask extends ImageDimensions {
  id: string;
  file: File;
  previewUrl: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  result?: ImageResult;
}

export interface RenderSpec {
  sourceRect?: SourceRect;
  outputSize: ImageDimensions;
  output: {
    mime: string;
    quality?: number;
    background?: string;
  };
}

export interface EncodingCapabilities {
  jpeg: boolean;
  png: boolean;
  webp: boolean;
  ico: boolean;
  svg: boolean;
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}
