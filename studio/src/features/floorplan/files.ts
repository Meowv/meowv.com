import { defaultState, LIB, MATS, ROOMS, WALLS } from './catalog';
import type { Furniture, PlanDocument, PlanState, Point } from './types';

export const MAX_PLAN_FILE_BYTES = 8 * 1024 * 1024;
const furnitureTypes = new Set(LIB.flatMap((category) => category.items.map((item) => item[0])));
const roomIds = new Set(ROOMS.map((room) => room.id));
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;

function fail(message: string): never {
  throw new Error(`方案文件无效：${message}`);
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}格式错误。`);
  return value as Record<string, unknown>;
}
function label(value: unknown, field: string, limit = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    fail(`${field}不能为空或过长。`);
  return value;
}
function number(value: unknown, field: string, min = -100_000, max = 100_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(`${field}超出允许范围。`);
  return value;
}
function point(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2) fail('测量坐标格式错误。');
  return [number(value[0], '测量坐标'), number(value[1], '测量坐标')];
}

export function validatePlanState(value: unknown, legacy = false): PlanState {
  const input = record(value, '方案');
  if (!Array.isArray(input.furniture) || input.furniture.length > 2000)
    fail('家具数量超过 2000 或格式错误。');
  const ids = new Set<string>();
  const furniture: Furniture[] = input.furniture.map((value) => {
    const item = record(value, '家具');
    const id = label(item.id, '家具 ID', 128);
    if (!identifier.test(id) || ids.has(id)) fail('家具 ID 重复或格式错误。');
    ids.add(id);
    const type = label(item.type, '家具类型');
    if (!furnitureTypes.has(type)) fail('存在不支持的家具类型。');
    const color = label(item.color, '家具颜色');
    if (!/^#[0-9a-f]{6}$/i.test(color)) fail('家具颜色必须是六位十六进制颜色。');
    return {
      id,
      type,
      name: label(item.name, '家具名称'),
      color,
      cx: number(item.cx, '家具横坐标'),
      cy: number(item.cy, '家具纵坐标'),
      w: number(item.w, '家具宽度', 50, 30_000),
      d: number(item.d, '家具深度', 50, 30_000),
      rot: number(item.rot, '家具角度', 0, 359),
    };
  });
  const inputRooms = record(input.rooms ?? (legacy ? {} : undefined), '房间');
  const rooms: PlanState['rooms'] = {};
  for (const key of Object.keys(inputRooms))
    if (!roomIds.has(key)) fail('房间 ID 不属于当前户型。');
  for (const room of ROOMS) {
    const settings = record(
      inputRooms[room.id] ?? (legacy ? { name: room.name, mat: room.mat } : undefined),
      '房间属性',
    );
    const mat = label(settings.mat, '地面材质');
    if (!Object.hasOwn(MATS, mat)) fail('存在不支持的地面材质。');
    rooms[room.id] = { name: label(settings.name, '房间名称'), mat };
  }
  const demolished = input.demolished ?? (legacy ? [] : undefined);
  if (!Array.isArray(demolished) || demolished.length > WALLS.length) fail('拆墙列表格式错误。');
  const removed = new Set<string>();
  for (const id of demolished) {
    if (typeof id !== 'string' || !/^w\d+$/.test(id)) fail('墙体 ID 格式错误。');
    const wall = WALLS[Number(id.slice(1))];
    if (!wall || id !== `w${Number(id.slice(1))}` || !['n', 'low'].includes(wall[4]))
      fail('不能拆除承重墙、外墙或不存在的墙体。');
    if (removed.has(id)) fail('拆墙列表包含重复项。');
    removed.add(id);
  }
  const measurements = input.measures ?? (legacy ? [] : undefined);
  if (!Array.isArray(measurements) || measurements.length > 2000)
    fail('测量数量超过 2000 或格式错误。');
  const measures = measurements.map((value) => {
    const measure = record(value, '测量');
    return { a: point(measure.a), b: point(measure.b) };
  });
  return { furniture, rooms, demolished: [...removed], measures };
}

export function newPlanDocument(
  title = '原木之家',
  state: PlanState = defaultState(),
): PlanDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    templateId: 'original-apartment',
    id: crypto.randomUUID(),
    title: title.trim().slice(0, 120) || '未命名方案',
    createdAt: now,
    updatedAt: now,
    revision: 0,
    state: validatePlanState(state),
  };
}

export function validatePlanDocument(value: unknown): PlanDocument {
  const input = record(value, '文档');
  if (input.schemaVersion !== 1) fail('不支持此文件版本。');
  if (input.templateId !== 'original-apartment') fail('不支持此户型模板。');
  const id = label(input.id, '文档 ID', 128);
  if (!identifier.test(id)) fail('文档 ID 格式错误。');
  const revision = number(input.revision, '文档版本', 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(revision)) fail('文档版本必须为整数。');
  const createdAt = label(input.createdAt, '创建时间');
  const updatedAt = label(input.updatedAt, '更新时间');
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt)))
    fail('文档时间格式错误。');
  return {
    schemaVersion: 1,
    templateId: 'original-apartment',
    id,
    title: label(input.title, '方案名称'),
    createdAt,
    updatedAt,
    revision,
    state: validatePlanState(input.state),
  };
}

export function parsePlanFile(text: string, filename = '导入方案'): PlanDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_PLAN_FILE_BYTES) fail('文件超过 8 MB。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('无法解析 JSON。');
  }
  const input = record(parsed, '文件');
  if ('schemaVersion' in input || 'templateId' in input || 'state' in input) {
    const doc = validatePlanDocument(input);
    return newPlanDocument(doc.title, doc.state);
  }
  return newPlanDocument(
    filename.replace(/(?:\.floorplan)?\.json$/i, ''),
    validatePlanState(input, true),
  );
}

export function serializePlanFile(doc: PlanDocument): string {
  return JSON.stringify(validatePlanDocument(doc), null, 2);
}
