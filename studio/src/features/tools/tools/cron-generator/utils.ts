import type { CronDialect } from '@/features/tools/tools/cron-parser/utils';

export type CronFrequency = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface CronGeneratorOptions {
  dialect: CronDialect;
  frequency: CronFrequency;
  interval: number;
  minute: number;
  hour: number;
  dayOfWeek: number;
  dayOfMonth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value || 0)));
}

export function generateCron(options: CronGeneratorOptions): string {
  const interval = clamp(options.interval, 1, 59);
  const minute = clamp(options.minute, 0, 59);
  const hour = clamp(options.hour, 0, 23);
  const dayOfWeek = clamp(options.dayOfWeek, 0, 6);
  const dayOfMonth = clamp(options.dayOfMonth, 1, 31);
  const quartz = options.dialect === 'quartz';

  if (quartz) {
    if (options.frequency === 'minutes') return `0 */${interval} * ? * *`;
    if (options.frequency === 'hourly') return `0 ${minute} * ? * *`;
    if (options.frequency === 'daily') return `0 ${minute} ${hour} ? * *`;
    if (options.frequency === 'weekly') return `0 ${minute} ${hour} ? * ${dayOfWeek + 1}`;
    return `0 ${minute} ${hour} ${dayOfMonth} * ?`;
  }

  if (options.frequency === 'minutes') return `*/${interval} * * * *`;
  if (options.frequency === 'hourly') return `${minute} * * * *`;
  if (options.frequency === 'daily') return `${minute} ${hour} * * *`;
  if (options.frequency === 'weekly') return `${minute} ${hour} * * ${dayOfWeek}`;
  return `${minute} ${hour} ${dayOfMonth} * *`;
}
