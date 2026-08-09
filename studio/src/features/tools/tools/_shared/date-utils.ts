export type DateUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export function parseDate(input: string): Date {
  const date = new Date(input);
  if (!input || Number.isNaN(date.getTime())) throw new Error('请选择有效日期。');
  return date;
}

export function addDate(input: string, amount: number, unit: DateUnit): Date {
  const date = parseDate(input);
  const value = Math.trunc(amount);
  if (unit === 'minutes') date.setMinutes(date.getMinutes() + value);
  else if (unit === 'hours') date.setHours(date.getHours() + value);
  else if (unit === 'days') date.setDate(date.getDate() + value);
  else if (unit === 'weeks') date.setDate(date.getDate() + value * 7);
  else if (unit === 'months') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + value);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  } else {
    const month = date.getMonth();
    const day = date.getDate();
    date.setDate(1);
    date.setFullYear(date.getFullYear() + value);
    date.setMonth(month);
    const lastDay = new Date(date.getFullYear(), month + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  }
  return date;
}

export function dateDifference(startInput: string, endInput: string): string {
  const start = parseDate(startInput);
  const end = parseDate(endInput);
  const milliseconds = end.getTime() - start.getTime();
  const absolute = Math.abs(milliseconds);
  return [
    `方向：${milliseconds >= 0 ? '结束时间晚于开始时间' : '结束时间早于开始时间'}`,
    `相差毫秒：${milliseconds}`,
    `相差秒数：${milliseconds / 1000}`,
    `相差分钟：${milliseconds / 60_000}`,
    `相差小时：${milliseconds / 3_600_000}`,
    `相差天数：${milliseconds / 86_400_000}`,
    `绝对时长：${Math.floor(absolute / 86_400_000)} 天 ${Math.floor((absolute % 86_400_000) / 3_600_000)} 小时 ${Math.floor((absolute % 3_600_000) / 60_000)} 分钟`,
  ].join('\n');
}

export function calculateAge(birthInput: string, targetInput: string): string {
  const birth = parseDate(birthInput);
  const target = parseDate(targetInput);
  if (target < birth) throw new Error('计算日期不能早于出生日期。');
  let years = target.getFullYear() - birth.getFullYear();
  let months = target.getMonth() - birth.getMonth();
  let days = target.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(target.getFullYear(), target.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const totalDays = Math.floor((target.getTime() - birth.getTime()) / 86_400_000);
  return [
    `年龄：${years} 岁 ${months} 个月 ${days} 天`,
    `累计天数：${totalDays}`,
    `累计周数：${Math.floor(totalDays / 7)}`,
  ].join('\n');
}

export function addWorkdays(startInput: string, workdays: number): Date {
  const date = parseDate(startInput);
  const direction = workdays < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(workdays));
  while (remaining > 0) {
    date.setDate(date.getDate() + direction);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function formatDate(date: Date, pattern: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
  };
  return pattern.replace(/YYYY|SSS|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
}

function partsInZone(date: Date, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function zonedTimeToUtc(input: string, timeZone: string): Date {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) throw new Error('日期时间格式无效。');
  const desired = match.slice(1).map(Number);
  const desiredUtc = Date.UTC(
    desired[0],
    desired[1] - 1,
    desired[2],
    desired[3],
    desired[4],
    desired[5] || 0,
  );
  let result = new Date(desiredUtc);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = partsInZone(result, timeZone);
    const observedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    result = new Date(result.getTime() + desiredUtc - observedUtc);
  }
  return result;
}

export function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
    hourCycle: 'h23',
  }).format(date);
}
