export type DateInterpretation = 'local' | 'utc';

export interface DateTimestampDetails {
  date: Date;
  seconds: number;
  milliseconds: number;
}

export function dateToTimestamp(
  input: string,
  interpretation: DateInterpretation,
): DateTimestampDetails {
  if (!input) throw new Error('请选择需要转换的日期和时间。');
  const source = interpretation === 'utc' ? `${input}:00Z` : input;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) throw new Error('日期格式无效或超出可处理范围。');
  return {
    date,
    seconds: Math.trunc(date.getTime() / 1000),
    milliseconds: date.getTime(),
  };
}

export function toDateTimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
