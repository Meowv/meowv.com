export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDimensions(width: number, height: number): string {
  if (width <= 0 || height <= 0) {
    return '读取中…';
  }
  return `${width} × ${height}`;
}

export function formatSizeChange(original: number, result: number): string {
  if (original <= 0) {
    return '—';
  }
  const change = ((result - original) / original) * 100;
  if (Math.abs(change) < 0.05) {
    return '体积不变';
  }
  return change < 0 ? `减少 ${Math.abs(change).toFixed(1)}%` : `增加 ${change.toFixed(1)}%`;
}
