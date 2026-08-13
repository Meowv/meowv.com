import { Solar } from 'lunar-javascript';
import type { DateKey, LunarDateInfo } from './types';

const lunarCache = new Map<DateKey, LunarDateInfo>();
const lunarYearNameCache = new Map<number, string>();

function toDateKey(year: number, month: number, day: number): DateKey {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getLunarDateInfo(year: number, month: number, day: number): LunarDateInfo {
  const key = toDateKey(year, month, day);
  const cached = lunarCache.get(key);
  if (cached) return cached;

  const lunar = Solar.fromYmd(year, month, day).getLunar();
  const lunarMonth = `${lunar.getMonthInChinese()}月`;
  const lunarDay = lunar.getDayInChinese();
  const solarTerm = lunar.getJieQi() || undefined;
  const result: LunarDateInfo = {
    lunarYear: lunar.getYearInGanZhi(),
    lunarMonth,
    lunarDay,
    shortText: lunarDay === '初一' ? lunarMonth : lunarDay,
    fullText: `${lunar.getYearInGanZhi()}年 ${lunarMonth}${lunarDay}`,
    solarTerm,
  };

  lunarCache.set(key, result);
  return result;
}

export function getLunarYearName(year: number): string {
  const cached = lunarYearNameCache.get(year);
  if (cached) return cached;

  const lunar = Solar.fromYmd(year, 7, 1).getLunar();
  const result = `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年`;
  lunarYearNameCache.set(year, result);
  return result;
}
