export type WallpaperDevice = 'desktop' | 'mobile';
export type WallpaperContent = 'dynamic' | 'static';

export interface WallpaperCategory {
  id: number;
  name: string;
  level: 1 | 2;
  parentId: number | null;
  deviceType: WallpaperDevice;
  contentType: WallpaperContent;
  sortOrder: number;
}

export interface WallpaperAsset {
  id: number;
  url: string;
  mediaType: 'image' | 'video' | 'other';
  mediaRole: string;
  width: number | null;
  height: number | null;
}

export interface WallpaperItem {
  id: number;
  title: string | null;
  tags: string[];
  author: string | null;
  deviceType: WallpaperDevice;
  contentType: WallpaperContent;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  remoteCreatedAt: string | null;
  coverUrl: string | null;
  previewVideoUrl: string | null;
}

export interface WallpaperCursor {
  remoteCreatedAt: string | null;
  id: number | null;
  contentRank?: 0 | 1;
}

export interface WallpaperQuery {
  device: WallpaperDevice;
  content: WallpaperContent;
  categoryId: number | null;
  keyword: string | null;
  cursor: WallpaperCursor | null;
  pageSize: number;
}

export interface WallpaperPageResult {
  items: WallpaperItem[];
  nextCursor: WallpaperCursor | null;
  hasMore: boolean;
}

export interface WallpaperBootstrapResult {
  items: WallpaperItem[];
  categories: WallpaperCategory[];
  generatedAt: string | null;
}

export interface WallpaperRandomBackgroundRequest {
  excludeId?: number | null;
}

export interface WallpaperWorkerRequest {
  id: string;
  action:
    'init' | 'prefetch' | 'bootstrap' | 'categories' | 'query' | 'detail' | 'random-background';
  payload?: unknown;
}

export interface WallpaperWorkerResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}
