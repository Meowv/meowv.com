export type SqlValue = string | number | Uint8Array | null;

export interface DatabaseMeta {
  fileName: string;
  fileSize: number;
  openedAt: number;
  source: 'new' | 'file-input' | 'demo';
}

export interface ColumnSchema {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number;
}

export interface SchemaObject {
  type: 'table' | 'view' | 'index' | 'trigger';
  name: string;
  tableName: string;
  sql: string | null;
}

export interface TableSchema {
  name: string;
  type: 'table' | 'view';
  sql: string | null;
  columns: ColumnSchema[];
  primaryKeyColumns: string[];
  editable: boolean;
}

export interface TableQuery {
  tableName: string;
  page: number;
  pageSize: number;
  search: string;
  searchColumn: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}

export interface RowIdentity {
  columns: string[];
  values: SqlValue[];
}

export interface TablePage {
  columns: ColumnSchema[];
  rows: SqlValue[][];
  total: number;
  page: number;
  pageSize: number;
  identityColumns: string[];
}

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
  changes: number;
  elapsedMs: number;
  truncated: boolean;
  didMutate: boolean;
}

export type WorkerAction =
  | 'init'
  | 'open'
  | 'new'
  | 'schema'
  | 'table-schema'
  | 'table-page'
  | 'execute'
  | 'insert'
  | 'update'
  | 'delete'
  | 'export';

export interface WorkerRequest<T = unknown> {
  id: string;
  action: WorkerAction;
  payload?: T;
}

export interface WorkerResponse<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
}
