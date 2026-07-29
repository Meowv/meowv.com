import type { WorkbookFileType } from "../models/workbook";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const maximumFractionDigits = value >= 100 || unitIndex === 0 ? 0 : 1;

  return `${value.toLocaleString("zh-CN", {
    maximumFractionDigits,
  })} ${units[unitIndex]}`;
}

export function formatDateTime(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) {
    return "—";
  }

  const differenceInSeconds = Math.round((timestamp - now) / 1_000);
  const absoluteSeconds = Math.abs(differenceInSeconds);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(differenceInSeconds, "second");
  }

  const differenceInMinutes = Math.round(differenceInSeconds / 60);
  if (Math.abs(differenceInMinutes) < 60) {
    return relativeTimeFormatter.format(differenceInMinutes, "minute");
  }

  const differenceInHours = Math.round(differenceInMinutes / 60);
  if (Math.abs(differenceInHours) < 24) {
    return relativeTimeFormatter.format(differenceInHours, "hour");
  }

  const differenceInDays = Math.round(differenceInHours / 24);
  if (Math.abs(differenceInDays) < 30) {
    return relativeTimeFormatter.format(differenceInDays, "day");
  }

  return formatDateTime(timestamp);
}

export function formatWorkbookSource(fileType?: WorkbookFileType): string {
  switch (fileType) {
    case "xlsx":
      return "XLSX 文件";
    case "xls":
      return "XLS 文件";
    case "csv":
      return "CSV 文件";
    case "template":
      return "内置模板";
    case "local":
      return "本地创建";
    default:
      return "本地创建";
  }
}
