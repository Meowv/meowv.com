declare module 'lunar-javascript' {
  interface LunarDate {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getYearInGanZhi(): string;
    getYearShengXiao(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getJieQi(): string;
    getJieQiTable(): Record<string, SolarDate>;
    getFestivals(): string[];
    getSolar(): SolarDate;
  }

  interface SolarDate {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): LunarDate;
    getFestivals(): string[];
    toYmd(): string;
  }

  interface LunarMonth {
    getYear(): number;
    getMonth(): number;
    getDayCount(): number;
  }

  interface LunarYearDate {
    getMonths(): LunarMonth[];
    getMonthsInYear(): LunarMonth[];
    getMonth(month: number): LunarMonth | null;
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate;
  };

  export const Lunar: {
    fromYmd(year: number, month: number, day: number): LunarDate;
  };

  export const LunarYear: {
    fromYear(year: number): LunarYearDate;
  };
}
