import initSqlJs from 'sql.js';
import type { Database, QueryExecResult, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type {
  ColumnSchema,
  QueryResult,
  RowIdentity,
  SchemaObject,
  SqlValue,
  TablePage,
  TableQuery,
  TableSchema,
  WorkerRequest,
  WorkerResponse,
} from '../types';

let SQL: SqlJsStatic | null = null;
let database: Database | null = null;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function getDatabase(): Database {
  if (!database) throw new Error('请先打开或新建一个 SQLite 数据库。');
  return database;
}

function resultRows(result: QueryExecResult | undefined): SqlValue[][] {
  return result?.values ?? [];
}

function readColumns(tableName: string): ColumnSchema[] {
  const rows = resultRows(
    getDatabase().exec(`PRAGMA table_xinfo(${quoteIdentifier(tableName)})`)[0],
  );
  return rows.map((row) => ({
    name: String(row[1] ?? ''),
    type: String(row[2] ?? ''),
    notNull: Number(row[3] ?? 0) === 1,
    defaultValue: row[4] === null || row[4] === undefined ? null : String(row[4]),
    primaryKeyPosition: Number(row[5] ?? 0),
  }));
}

function tableSchema(tableName: string): TableSchema {
  const schemaRow = getDatabase().exec(
    'SELECT type, sql FROM sqlite_schema WHERE name = ? LIMIT 1',
    [tableName],
  )[0];
  const row = schemaRow?.values[0];
  if (!row || (row[0] !== 'table' && row[0] !== 'view')) {
    throw new Error('未找到该数据库对象。');
  }
  const columns = readColumns(tableName);
  const primaryKeyColumns = columns
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition)
    .map((column) => column.name);
  let editable = row[0] === 'table' && primaryKeyColumns.length > 0;
  if (!editable && row[0] === 'table') {
    try {
      getDatabase().exec(`SELECT rowid FROM ${quoteIdentifier(tableName)} LIMIT 1`);
      editable = true;
    } catch {
      editable = false;
    }
  }
  return {
    name: tableName,
    type: row[0] as 'table' | 'view',
    sql: row[1] === null ? null : String(row[1]),
    columns,
    primaryKeyColumns,
    editable,
  };
}

function readSchema(): SchemaObject[] {
  const result = getDatabase().exec(
    "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE type IN ('table', 'view', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'view' THEN 2 WHEN 'index' THEN 3 ELSE 4 END, name",
  )[0];
  return resultRows(result).map((row) => ({
    type: row[0] as SchemaObject['type'],
    name: String(row[1]),
    tableName: String(row[2] ?? ''),
    sql: row[3] === null ? null : String(row[3]),
  }));
}

function tablePage(query: TableQuery): TablePage {
  const schema = tableSchema(query.tableName);
  const validNames = new Set(schema.columns.map((column) => column.name));
  const safeSort = validNames.has(query.sortColumn) ? query.sortColumn : '';
  const searchColumn = validNames.has(query.searchColumn) ? query.searchColumn : '';
  const where =
    query.search.trim() && searchColumn
      ? ` WHERE CAST(${quoteIdentifier(searchColumn)} AS TEXT) LIKE ?`
      : '';
  const params: SqlValue[] = where ? [`%${query.search.trim()}%`] : [];
  const offset = Math.max(0, query.page - 1) * query.pageSize;
  let identityColumns = schema.primaryKeyColumns;
  let selectPrefix = '';
  if (schema.type === 'table' && identityColumns.length === 0) {
    try {
      getDatabase().exec(`SELECT rowid FROM ${quoteIdentifier(query.tableName)} LIMIT 1`);
      selectPrefix = 'rowid AS "__studio_rowid__", ';
      identityColumns = ['__studio_rowid__'];
    } catch {
      identityColumns = [];
    }
  }
  const order = safeSort
    ? ` ORDER BY ${quoteIdentifier(safeSort)} ${query.sortDirection === 'desc' ? 'DESC' : 'ASC'}`
    : '';
  const db = getDatabase();
  const rows = resultRows(
    db.exec(
      `SELECT ${selectPrefix}* FROM ${quoteIdentifier(query.tableName)}${where}${order} LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    )[0],
  );
  const total = Number(
    resultRows(
      db.exec(`SELECT COUNT(*) FROM ${quoteIdentifier(query.tableName)}${where}`, params)[0],
    )[0]?.[0] ?? 0,
  );
  return {
    columns: schema.columns,
    rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    identityColumns,
  };
}

function executeSql(sql: string): QueryResult {
  const startedAt = performance.now();
  const db = getDatabase();
  const columns: string[] = [];
  const rows: SqlValue[][] = [];
  let truncated = false;
  let didMutate = false;
  let changes = 0;
  const statements = db.iterateStatements(sql);
  for (let item = statements.next(); !item.done; item = statements.next()) {
    const statement = item.value;
    try {
      const names = statement.getColumnNames();
      const normalized = statement.getNormalizedSQL().trim().toUpperCase();
      const isRowMutation = /^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(normalized);
      if (isRowMutation || /^(CREATE|ALTER|DROP|VACUUM|REINDEX|ATTACH|DETACH)\b/.test(normalized)) {
        didMutate = true;
      }
      if (names.length) {
        columns.splice(0, columns.length, ...names);
        while (statement.step()) {
          if (rows.length >= 5000) {
            truncated = true;
            break;
          }
          rows.push(statement.get() as SqlValue[]);
        }
      } else {
        statement.step();
      }
      if (isRowMutation) changes += db.getRowsModified();
    } finally {
      statement.free();
    }
  }
  return {
    columns,
    rows,
    changes,
    elapsedMs: Math.round(performance.now() - startedAt),
    truncated,
    didMutate,
  };
}

function transaction(run: () => void): void {
  const db = getDatabase();
  db.run('BEGIN');
  try {
    run();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function assertEditable(tableName: string, identity?: RowIdentity): void {
  const schema = tableSchema(tableName);
  if (!schema.editable || (identity && identity.columns.length === 0)) {
    throw new Error('该对象没有可用于唯一定位记录的主键或 rowid，当前仅支持只读浏览。');
  }
}

function insertRow(payload: { tableName: string; values: Record<string, SqlValue> }): number {
  assertEditable(payload.tableName);
  const entries = Object.entries(payload.values);
  transaction(() => {
    if (entries.length === 0)
      getDatabase().run(`INSERT INTO ${quoteIdentifier(payload.tableName)} DEFAULT VALUES`);
    else {
      getDatabase().run(
        `INSERT INTO ${quoteIdentifier(payload.tableName)} (${entries.map(([key]) => quoteIdentifier(key)).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
        entries.map(([, value]) => value),
      );
    }
  });
  return getDatabase().getRowsModified();
}

function updateRow(payload: {
  tableName: string;
  values: Record<string, SqlValue>;
  identity: RowIdentity;
}): number {
  assertEditable(payload.tableName, payload.identity);
  const entries = Object.entries(payload.values);
  if (entries.length === 0) return 0;
  transaction(() => {
    getDatabase().run(
      `UPDATE ${quoteIdentifier(payload.tableName)} SET ${entries.map(([key]) => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE ${payload.identity.columns.map((key) => `${quoteIdentifier(key)} IS ?`).join(' AND ')}`,
      [...entries.map(([, value]) => value), ...payload.identity.values],
    );
  });
  return getDatabase().getRowsModified();
}

function deleteRow(payload: { tableName: string; identity: RowIdentity }): number {
  assertEditable(payload.tableName, payload.identity);
  transaction(() => {
    getDatabase().run(
      `DELETE FROM ${quoteIdentifier(payload.tableName)} WHERE ${payload.identity.columns.map((key) => `${quoteIdentifier(key)} IS ?`).join(' AND ')}`,
      payload.identity.values,
    );
  });
  return getDatabase().getRowsModified();
}

async function handle(request: WorkerRequest): Promise<unknown> {
  if (request.action === 'init') {
    SQL ??= await initSqlJs({ locateFile: () => sqlWasmUrl });
    return true;
  }
  if (!SQL) SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  if (request.action === 'open') {
    const payload = request.payload as { buffer: ArrayBuffer };
    database?.close();
    database = new SQL.Database(new Uint8Array(payload.buffer));
    return readSchema();
  }
  if (request.action === 'new') {
    database?.close();
    database = new SQL.Database();
    return readSchema();
  }
  if (request.action === 'schema') return readSchema();
  if (request.action === 'table-schema')
    return tableSchema((request.payload as { tableName: string }).tableName);
  if (request.action === 'table-page') return tablePage(request.payload as TableQuery);
  if (request.action === 'execute') return executeSql((request.payload as { sql: string }).sql);
  if (request.action === 'insert')
    return insertRow(request.payload as { tableName: string; values: Record<string, SqlValue> });
  if (request.action === 'update')
    return updateRow(
      request.payload as {
        tableName: string;
        values: Record<string, SqlValue>;
        identity: RowIdentity;
      },
    );
  if (request.action === 'delete')
    return deleteRow(request.payload as { tableName: string; identity: RowIdentity });
  if (request.action === 'export') return getDatabase().export();
  throw new Error('未知数据库请求。');
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void handle(request).then(
    (data) => {
      const response: WorkerResponse = { id: request.id, ok: true, data };
      if (data instanceof Uint8Array) self.postMessage(response, [data.buffer]);
      else self.postMessage(response);
    },
    (error: unknown) => {
      const response: WorkerResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : 'SQLite 操作失败。',
      };
      self.postMessage(response);
    },
  );
};
