import { createDbWorker, type WorkerHttpvfs } from 'sql.js-httpvfs';
import type {
  WallpaperCategory,
  WallpaperItem,
  WallpaperPageResult,
  WallpaperQuery,
  WallpaperWorkerRequest,
  WallpaperWorkerResponse,
} from '../types';

type SqlValue = string | number | Uint8Array | null;

let database: WorkerHttpvfs | null = null;

const workerUrl = new URL('sql.js-httpvfs/dist/sqlite.worker.js', import.meta.url).toString();
const wasmUrl = new URL('sql.js-httpvfs/dist/sql-wasm.wasm', import.meta.url).toString();

function rowObjects(
  result: { columns: string[]; values: unknown[][] } | undefined,
): Record<string, unknown>[] {
  if (!result) return [];
  return result.values.map((row) =>
    Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
  );
}

async function ensureDatabase(): Promise<WorkerHttpvfs> {
  if (database) return database;
  const dataBaseUrl = `${import.meta.env.BASE_URL}data/`;
  const manifestResponse = await fetch(`${dataBaseUrl}wallpapers.catalog.json`, {
    cache: 'no-cache',
  });
  if (!manifestResponse.ok)
    throw new Error(`无法加载壁纸数据库清单（HTTP ${manifestResponse.status}）。`);
  const manifest = (await manifestResponse.json()) as {
    database?: string;
    fileSize?: number;
  };
  if (!manifest.database) throw new Error('壁纸数据库清单缺少 database 字段。');
  database = await createDbWorker(
    [
      {
        from: 'inline',
        config: {
          serverMode: 'full',
          requestChunkSize: 4096,
          url: `${dataBaseUrl}${manifest.database}`,
        },
      },
    ],
    workerUrl,
    wasmUrl,
    Math.max(64 * 1024 * 1024, manifest.fileSize ?? 0),
  );
  return database;
}

async function exec(
  sql: string,
  params: unknown[] = [],
): Promise<{ columns: string[]; values: unknown[][] }> {
  const result = await (await ensureDatabase()).db.exec(sql, params as SqlValue[]);
  return result[0] ?? { columns: [], values: [] };
}

async function getCategories(payload: {
  device: string;
  content: string;
}): Promise<WallpaperCategory[]> {
  const contentValues = payload.content === 'dynamic' ? ['dynamic', 'static'] : ['static'];
  const placeholders = contentValues.map(() => '?').join(',');
  const result = await exec(
    `SELECT id, name, level, parent_id AS parentId, device_type AS deviceType,
            content_type AS contentType, sort_order AS sortOrder
       FROM category
      WHERE device_type = ? AND content_type IN (${placeholders})
      ORDER BY level, sort_order, id`,
    [payload.device, ...contentValues],
  );
  return rowObjects(result) as unknown as WallpaperCategory[];
}

function querySql(query: WallpaperQuery): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const conditions = ["w.status = 'active'", 'w.device_type = ?'];
  params.push(query.device);
  if (query.content === 'dynamic') conditions.push("w.content_type IN ('dynamic', 'static')");
  else {
    conditions.push('w.content_type = ?');
    params.push(query.content);
  }
  if (query.categoryId !== null) {
    conditions.push(`EXISTS (
      SELECT 1 FROM wallpaper_category wc
      WHERE wc.wallpaper_id = w.id
        AND wc.category_id IN (
          SELECT c.id
            FROM category c
           WHERE c.name = (SELECT name FROM category WHERE id = ?)
              OR c.parent_id IN (
                SELECT p.id FROM category p
                 WHERE p.name = (SELECT name FROM category WHERE id = ?)
              )
        )
    )`);
    params.push(query.categoryId, query.categoryId);
  }
  const keyword = query.keyword?.trim();
  if (keyword) {
    conditions.push(`(
      lower(COALESCE(w.title, '')) LIKE lower(?)
      OR lower(COALESCE(w.author, '')) LIKE lower(?)
      OR EXISTS (
        SELECT 1 FROM wallpaper_keyword wk
        JOIN keyword k ON k.id = wk.keyword_id
        WHERE wk.wallpaper_id = w.id AND lower(k.keyword) = lower(?)
      )
    )`);
    const pattern = `%${keyword}%`;
    params.push(pattern, pattern, keyword);
  }
  if (query.cursor?.remoteCreatedAt && query.cursor.id !== null) {
    conditions.push(
      '(COALESCE(w.remote_created_at, w.first_seen_at) < ? OR (COALESCE(w.remote_created_at, w.first_seen_at) = ? AND w.id < ?))',
    );
    params.push(query.cursor.remoteCreatedAt, query.cursor.remoteCreatedAt, query.cursor.id);
  }
  const limit = Math.max(1, Math.min(100, query.pageSize)) + 1;
  params.push(limit);
  return {
    sql: `SELECT w.id, w.title, w.author, w.device_type AS deviceType,
                 w.content_type AS contentType, w.width, w.height,
                 w.duration_seconds AS durationSeconds,
                 COALESCE(w.remote_created_at, w.first_seen_at) AS remoteCreatedAt,
                 CASE WHEN w.content_type = 'dynamic' THEN 0 ELSE 1 END AS contentRank
            FROM wallpaper w
           WHERE ${conditions.join(' AND ')}
           ORDER BY contentRank, remoteCreatedAt DESC, w.id DESC
           LIMIT ?`,
    params,
  };
}

async function queryWallpapers(query: WallpaperQuery): Promise<WallpaperPageResult> {
  const builtQuery = querySql(query);
  const page = await exec(builtQuery.sql, builtQuery.params);
  const rows = rowObjects(page);
  const hasMore = rows.length > query.pageSize;
  const visible = rows.slice(0, query.pageSize) as unknown as (WallpaperItem & {
    contentRank: number;
  })[];
  if (visible.length === 0) return { items: [], nextCursor: null, hasMore: false };
  const ids = visible.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const assets = rowObjects(
    await exec(
      `SELECT wa.wallpaper_id AS wallpaperId, a.id, a.url, a.media_type AS mediaType,
              a.media_role AS mediaRole, a.width, a.height, wa.is_primary AS isPrimary,
              wa.sort_order AS sortOrder
         FROM wallpaper_asset wa JOIN asset a ON a.id = wa.asset_id
        WHERE wa.wallpaper_id IN (${placeholders}) AND a.accessible = 1
        ORDER BY wa.wallpaper_id, isPrimary DESC, sortOrder, a.id`,
      ids,
    ),
  );
  const tags = rowObjects(
    await exec(
      `SELECT wk.wallpaper_id AS wallpaperId, k.keyword
         FROM wallpaper_keyword wk JOIN keyword k ON k.id = wk.keyword_id
        WHERE wk.wallpaper_id IN (${placeholders}) AND k.keyword_type = 'tag'
        ORDER BY wk.wallpaper_id, COALESCE(wk.match_rank, 999999), k.id`,
      ids,
    ),
  );
  const byId = new Map<number, { coverUrl: string | null; previewVideoUrl: string | null }>();
  for (const asset of assets) {
    const wallpaperId = Number(asset.wallpaperId);
    const current = byId.get(wallpaperId) ?? { coverUrl: null, previewVideoUrl: null };
    if (asset.mediaRole === 'image' && !current.coverUrl) current.coverUrl = String(asset.url);
    if (asset.mediaRole === 'video_preview' && !current.previewVideoUrl)
      current.previewVideoUrl = String(asset.url);
    byId.set(wallpaperId, current);
  }
  const tagsById = new Map<number, string[]>();
  for (const tag of tags) {
    const wallpaperId = Number(tag.wallpaperId);
    const keyword = String(tag.keyword ?? '').trim();
    if (!keyword) continue;
    const current = tagsById.get(wallpaperId) ?? [];
    if (current.length < 4 && !current.includes(keyword)) current.push(keyword);
    tagsById.set(wallpaperId, current);
  }
  const items = visible.map((item) => {
    const { contentRank, ...base } = item;
    void contentRank;
    return { ...base, tags: tagsById.get(item.id) ?? [], ...byId.get(item.id) };
  }) as WallpaperItem[];
  const last = visible[visible.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore ? { remoteCreatedAt: last.remoteCreatedAt, id: last.id } : null,
  };
}

async function detail(id: number): Promise<WallpaperItem | null> {
  const result = await exec(
    `SELECT w.id, w.title, w.author, w.device_type AS deviceType,
            w.content_type AS contentType, w.width, w.height,
            w.duration_seconds AS durationSeconds,
            COALESCE(w.remote_created_at, w.first_seen_at) AS remoteCreatedAt
       FROM wallpaper w WHERE w.id = ? LIMIT 1`,
    [id],
  );
  const item = rowObjects(result)[0] as unknown as WallpaperItem | undefined;
  if (!item) return null;
  const assets = rowObjects(
    await exec(
      `SELECT a.url, a.media_type AS mediaType, a.media_role AS mediaRole,
            a.width, a.height, wa.is_primary AS isPrimary, wa.sort_order AS sortOrder
       FROM wallpaper_asset wa JOIN asset a ON a.id = wa.asset_id
      WHERE wa.wallpaper_id = ? AND a.accessible = 1
      ORDER BY isPrimary DESC, sortOrder, a.id`,
      [id],
    ),
  );
  item.coverUrl =
    (assets.find((asset) => asset.mediaRole === 'image')?.url as string | undefined) ?? null;
  item.previewVideoUrl =
    (assets.find((asset) => asset.mediaRole === 'video_preview')?.url as string | undefined) ??
    null;
  const tags = rowObjects(
    await exec(
      `SELECT k.keyword
         FROM wallpaper_keyword wk JOIN keyword k ON k.id = wk.keyword_id
        WHERE wk.wallpaper_id = ? AND k.keyword_type = 'tag'
        ORDER BY COALESCE(wk.match_rank, 999999), k.id
        LIMIT 4`,
      [id],
    ),
  );
  item.tags = tags
    .map((tag) => String(tag.keyword ?? '').trim())
    .filter((keyword, index, all) => keyword && all.indexOf(keyword) === index);
  return item;
}

self.onmessage = async (event: MessageEvent<WallpaperWorkerRequest>) => {
  const request = event.data;
  const response: WallpaperWorkerResponse = { id: request.id, ok: true };
  try {
    if (request.action === 'init') await ensureDatabase();
    else if (request.action === 'categories')
      response.data = await getCategories(request.payload as { device: string; content: string });
    else if (request.action === 'query')
      response.data = await queryWallpapers(request.payload as WallpaperQuery);
    else if (request.action === 'detail')
      response.data = await detail(Number((request.payload as { id: number }).id));
    self.postMessage(response);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : '壁纸数据库查询失败。';
    self.postMessage(response);
  }
};
