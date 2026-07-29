export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(precision)} ${units[exponent]}`;
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.max(1, Math.round(milliseconds))} 毫秒`;
  }

  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} 秒`;
}

export function padPageNumber(pageNumber: number, totalPages: number): string {
  const width = Math.max(3, String(totalPages).length);
  return String(pageNumber).padStart(width, "0");
}
