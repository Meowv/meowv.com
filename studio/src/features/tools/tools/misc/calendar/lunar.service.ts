import { Solar } from 'lunar-javascript';
import type { DateKey, LunarDateInfo } from './types';

const lunarCache = new Map<DateKey, LunarDateInfo>();
const lunarYearNameCache = new Map<number, string>();
const LUNAR_CACHE_LIMIT = 800;
const YEAR_CACHE_LIMIT = 32;

function setCachedValue<Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
  value: Value,
  limit: number,
): void {
  cache.set(key, value);
  if (cache.size <= limit) return;
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

function toDateKey(year: number, month: number, day: number): DateKey {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getLunarDateInfo(year: number, month: number, day: number): LunarDateInfo {
  const key = toDateKey(year, month, day);
  const cached = lunarCache.get(key);
  if (cached) return cached;

  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
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
    festivals: [
      ...new Set([
        ...solar.getFestivals(),
        ...lunar.getFestivals(),
        ...(solarTerm === '清明' ? ['清明节'] : []),
      ]),
    ],
  };

  setCachedValue(lunarCache, key, result, LUNAR_CACHE_LIMIT);
  return result;
}

export function getLunarYearName(year: number): string {
  const cached = lunarYearNameCache.get(year);
  if (cached) return cached;

  const lunar = Solar.fromYmd(year, 7, 1).getLunar();
  const result = `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年`;
  setCachedValue(lunarYearNameCache, year, result, YEAR_CACHE_LIMIT);
  return result;
}
