export const SQLITE_ROWID_ALIAS = '__studio_rowid__';

export function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function identityExpression(column: string, realColumns: ReadonlySet<string>): string {
  // 表里确实存在同名列时才按普通列处理，避免把哨兵别名误当成真实字段。
  return column === SQLITE_ROWID_ALIAS && !realColumns.has(column)
    ? 'rowid'
    : quoteIdentifier(column);
}

export function sameColumns(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}
