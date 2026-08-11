export type CronDialect = 'linux' | 'quartz' | 'hangfire';

interface ParsedField {
  raw: string;
  values: Set<number>;
  unrestricted: boolean;
  question: boolean;
}

export interface ParsedCron {
  dialect: CronDialect;
  expression: string;
  second: ParsedField;
  minute: ParsedField;
  hour: ParsedField;
  dayOfMonth: ParsedField;
  month: ParsedField;
  dayOfWeek: ParsedField;
  year?: ParsedField;
  fields: ReadonlyArray<{ label: string; value: string }>;
}

interface FieldSpec {
  label: string;
  min: number;
  max: number;
  aliases?: Record<string, number>;
  normalize?: (value: number) => number;
  allowQuestion?: boolean;
}

const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const LINUX_WEEKDAYS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
const QUARTZ_WEEKDAYS = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 };

function numericValue(value: string, spec: FieldSpec): number {
  const alias = spec.aliases?.[value.toUpperCase()];
  const numeric = alias ?? Number(value);
  if (!Number.isInteger(numeric) || numeric < spec.min || numeric > spec.max) {
    throw new Error(`${spec.label}“${value}”超出 ${spec.min}-${spec.max} 范围。`);
  }
  return numeric;
}

function addRange(
  target: Set<number>,
  start: number,
  end: number,
  step: number,
  spec: FieldSpec,
): void {
  if (end < start) throw new Error(`${spec.label}范围不能从大到小。`);
  for (let value = start; value <= end; value += step) {
    target.add(spec.normalize ? spec.normalize(value) : value);
  }
}

function parseField(raw: string, spec: FieldSpec): ParsedField {
  const value = raw.trim().toUpperCase();
  if (!value) throw new Error(`${spec.label}不能为空。`);
  if (/[LW#]/.test(value)) {
    throw new Error(`${spec.label}暂不支持 L、W 或 # 扩展语法。`);
  }
  if (value === '?' && !spec.allowQuestion) {
    throw new Error(`${spec.label}不支持 ? 占位符。`);
  }

  const values = new Set<number>();
  const question = value === '?';
  const unrestricted = value === '*' || question;

  for (const item of value.split(',')) {
    const [rangePart, stepPart] = item.split('/');
    if (!rangePart || item.split('/').length > 2) throw new Error(`${spec.label}语法无效：${item}`);
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`${spec.label}步长必须是正整数。`);

    if (rangePart === '*' || rangePart === '?') {
      if (rangePart === '?' && !spec.allowQuestion)
        throw new Error(`${spec.label}不支持 ? 占位符。`);
      addRange(values, spec.min, spec.max, step, spec);
      continue;
    }

    const range = rangePart.split('-');
    if (range.length > 2) throw new Error(`${spec.label}范围语法无效：${rangePart}`);
    const start = numericValue(range[0], spec);
    const end = range.length === 2 ? numericValue(range[1], spec) : stepPart ? spec.max : start;
    addRange(values, start, end, step, spec);
  }

  if (!values.size) throw new Error(`${spec.label}没有可用值。`);
  return { raw, values, unrestricted, question };
}

function fieldSpecs(dialect: CronDialect): FieldSpec[] {
  const quartz = dialect === 'quartz';
  return [
    ...(quartz ? [{ label: '秒', min: 0, max: 59 }] : []),
    { label: '分钟', min: 0, max: 59 },
    { label: '小时', min: 0, max: 23 },
    { label: '日', min: 1, max: 31, allowQuestion: quartz },
    { label: '月', min: 1, max: 12, aliases: MONTHS },
    quartz
      ? { label: '星期', min: 1, max: 7, aliases: QUARTZ_WEEKDAYS, allowQuestion: true }
      : {
          label: '星期',
          min: 0,
          max: 7,
          aliases: LINUX_WEEKDAYS,
          normalize: (value: number) => (value === 7 ? 0 : value),
        },
    ...(quartz ? [{ label: '年', min: 1970, max: 2099 }] : []),
  ];
}

export function parseCron(expression: string, dialect: CronDialect): ParsedCron {
  const parts = expression.trim().split(/\s+/).filter(Boolean);
  const expected = dialect === 'quartz' ? [6, 7] : [5];
  if (!expected.includes(parts.length)) {
    throw new Error(
      dialect === 'quartz'
        ? 'Quartz Cron 需要 6 或 7 个字段：秒 分 时 日 月 星期 [年]。'
        : `${dialect === 'linux' ? 'Linux' : 'Hangfire'} Cron 需要 5 个字段：分 时 日 月 星期。`,
    );
  }

  const specs = fieldSpecs(dialect).slice(0, parts.length);
  const parsed = parts.map((part, index) => parseField(part, specs[index]));
  const offset = dialect === 'quartz' ? 1 : 0;
  const schedule: ParsedCron = {
    dialect,
    expression: parts.join(' '),
    second:
      dialect === 'quartz'
        ? parsed[0]
        : { raw: '0', values: new Set([0]), unrestricted: false, question: false },
    minute: parsed[offset],
    hour: parsed[offset + 1],
    dayOfMonth: parsed[offset + 2],
    month: parsed[offset + 3],
    dayOfWeek: parsed[offset + 4],
    year: dialect === 'quartz' && parsed.length === 7 ? parsed[6] : undefined,
    fields: specs.map((spec, index) => ({ label: spec.label, value: parts[index] })),
  };

  if (dialect === 'quartz' && schedule.dayOfMonth.question === schedule.dayOfWeek.question) {
    throw new Error('Quartz Cron 的“日”和“星期”字段必须且只能有一个使用 ?。');
  }
  return schedule;
}

function dayMatches(schedule: ParsedCron, date: Date): boolean {
  const dayOfMonth = schedule.dayOfMonth.values.has(date.getDate());
  const weekdayValue = schedule.dialect === 'quartz' ? date.getDay() + 1 : date.getDay();
  const dayOfWeek = schedule.dayOfWeek.values.has(weekdayValue);

  if (schedule.dialect === 'quartz') {
    return schedule.dayOfMonth.question ? dayOfWeek : dayOfMonth;
  }
  if (schedule.dayOfMonth.unrestricted && schedule.dayOfWeek.unrestricted) return true;
  if (schedule.dayOfMonth.unrestricted) return dayOfWeek;
  if (schedule.dayOfWeek.unrestricted) return dayOfMonth;
  return dayOfMonth || dayOfWeek;
}

function scheduleMatches(schedule: ParsedCron, date: Date): boolean {
  return (
    schedule.minute.values.has(date.getMinutes()) &&
    schedule.hour.values.has(date.getHours()) &&
    schedule.month.values.has(date.getMonth() + 1) &&
    (!schedule.year || schedule.year.values.has(date.getFullYear())) &&
    dayMatches(schedule, date)
  );
}

export function nextCronRuns(schedule: ParsedCron, count = 5, from = new Date()): Date[] {
  const results: Date[] = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  const seconds = [...schedule.second.values].sort((a, b) => a - b);
  const maxMinutes = 60 * 24 * 366 * 10;

  for (let iteration = 0; iteration < maxMinutes && results.length < count; iteration += 1) {
    if (scheduleMatches(schedule, cursor)) {
      for (const second of seconds) {
        const candidate = new Date(cursor);
        candidate.setSeconds(second, 0);
        if (candidate > from) results.push(candidate);
        if (results.length >= count) break;
      }
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  if (results.length < count) {
    throw new Error('未来 10 年内未找到足够的执行时间，请检查表达式或年份字段。');
  }
  return results;
}

export function dialectLabel(dialect: CronDialect): string {
  return dialect === 'linux'
    ? 'Linux Cron'
    : dialect === 'quartz'
      ? 'Quartz Cron'
      : 'Hangfire Cron';
}
