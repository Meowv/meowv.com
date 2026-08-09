export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds';

export interface TimestampDetails {
  date: Date;
  seconds: number;
  milliseconds: number;
  local: string;
  utc: string;
  iso: string;
  timezone: string;
}

export function timestampToDate(input: string, unit: TimestampUnit): TimestampDetails {
  const numeric = Number(input.trim());
  if (!input.trim() || !Number.isFinite(numeric)) {
    throw new Error('请输入有效的数字时间戳。');
  }

  const resolvedUnit =
    unit === 'auto' ? (Math.abs(numeric) < 1e11 ? 'seconds' : 'milliseconds') : unit;
  const milliseconds = resolvedUnit === 'seconds' ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error('时间戳超出浏览器可处理的日期范围。');
  }

  return {
    date,
    seconds: Math.trunc(milliseconds / 1000),
    milliseconds: Math.trunc(milliseconds),
    local: date.toLocaleString(),
    utc: date.toUTCString(),
    iso: date.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区',
  };
}
