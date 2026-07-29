import { database } from "../database";
import { toPersistenceError } from "../../models/app-error";
import type { AppSettings } from "../../models/workbook";
import { DEFAULT_APP_SETTINGS, GLOBAL_SETTINGS_ID } from "../../models/workbook";

export type AppSettingsUpdate = Partial<Omit<AppSettings, "id">>;

export function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
  const definedSettings = Object.fromEntries(
    Object.entries(settings ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<AppSettings>;
  const merged = {
    ...DEFAULT_APP_SETTINGS,
    ...definedSettings,
  };

  return {
    ...merged,
    id: GLOBAL_SETTINGS_ID,
    locale: "zh-CN",
    autoSaveDelay:
      Number.isFinite(merged.autoSaveDelay) && merged.autoSaveDelay >= 0
        ? merged.autoSaveDelay
        : DEFAULT_APP_SETTINGS.autoSaveDelay,
    createRevisionInterval:
      Number.isFinite(merged.createRevisionInterval) && merged.createRevisionInterval >= 0
        ? merged.createRevisionInterval
        : DEFAULT_APP_SETTINGS.createRevisionInterval,
    maxAutoRevisions:
      Number.isFinite(merged.maxAutoRevisions) && merged.maxAutoRevisions >= 0
        ? Math.floor(merged.maxAutoRevisions)
        : DEFAULT_APP_SETTINGS.maxAutoRevisions,
    defaultFontSize:
      Number.isFinite(merged.defaultFontSize) && merged.defaultFontSize > 0
        ? merged.defaultFontSize
        : DEFAULT_APP_SETTINGS.defaultFontSize,
  };
}

export class SettingsRepository {
  async get(): Promise<AppSettings> {
    try {
      const stored = await database.settings.get(GLOBAL_SETTINGS_ID);
      return normalizeAppSettings(stored);
    } catch (error) {
      throw toPersistenceError(error, "读取应用设置失败。");
    }
  }

  async save(changes: AppSettingsUpdate): Promise<AppSettings> {
    try {
      return await database.transaction("rw", database.settings, async () => {
        const current = await database.settings.get(GLOBAL_SETTINGS_ID);
        const settings = normalizeAppSettings({ ...current, ...changes });
        await database.settings.put(settings);
        return settings;
      });
    } catch (error) {
      throw toPersistenceError(error, "保存应用设置失败。");
    }
  }

  async reset(): Promise<AppSettings> {
    const settings = normalizeAppSettings();

    try {
      await database.settings.put(settings);
      return settings;
    } catch (error) {
      throw toPersistenceError(error, "重置应用设置失败。");
    }
  }
}

export const settingsRepository = new SettingsRepository();
