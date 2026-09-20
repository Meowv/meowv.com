/**
 * 推广位的显隐规则与「已关闭」状态。
 *
 * 规则集中在这一个文件里，页面与组件都不各自判断 —— 日后要调"关闭按钮是否也隐藏灯箱入口"，
 * 只改 `resolveLivewallPromoVisibility` 一处。
 */

import { STORAGE_POLICY } from '@/core/privacy/storage';
import type { WallpaperDevice } from '../types';

/**
 * 关闭态存储键。
 *
 * **只写 sessionStorage**：关闭只在当前标签页会话内有效，刷新、新开标签页或重新进入站点都会
 * 重新露出一次 —— 不做长期记忆，也就不需要"发新版/满 N 天再露出"这类失效策略。
 *
 * 键名沿用 `STORAGE_POLICY.preferences` 前缀而不是 `namespace('wallpapers')`：
 * 后者需要往 `core/privacy/storage.ts` 的 `StorageFeature` 联合类型里加成员，
 * 而本功能没必要动 core。先例：`StudioShell.vue` 的 `wallpapers-header-collapsed`。
 */
export const LIVEWALL_PROMO_DISMISS_KEY = `${STORAGE_POLICY.preferences}:wallpapers-app-promo-dismissed`;

export interface LivewallPromoVisibility {
  /** 右下角浮层。 */
  popup: boolean;
  /** 灯箱内 CTA。 */
  lightboxCta: boolean;
}

export interface LivewallPromoVisibilityInput {
  device: WallpaperDevice;
  dismissed: boolean;
}

/**
 * 桌面 App 只对「电脑」筛选有意义 —— 手机视图下两个推广位都不显示。
 *
 * 关闭按钮只作用于右下角浮层；灯箱入口是场景化入口（用户正在操作某张壁纸时出现），不随关闭消失。
 * 若要让关闭"两处全隐"，把下面的 `true` 改成 `!input.dismissed` 即可。
 */
export function resolveLivewallPromoVisibility(
  input: LivewallPromoVisibilityInput,
): LivewallPromoVisibility {
  if (input.device !== 'desktop') {
    return { popup: false, lightboxCta: false };
  }
  return { popup: !input.dismissed, lightboxCta: true };
}

/** 本地存储不可用（隐私模式等）时按"未关闭"处理，不影响本次使用。 */
export function readLivewallPromoDismissed(storage?: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LIVEWALL_PROMO_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLivewallPromoDismissed(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  dismissed: boolean,
): void {
  if (!storage) return;
  try {
    if (dismissed) storage.setItem(LIVEWALL_PROMO_DISMISS_KEY, '1');
    else storage.removeItem(LIVEWALL_PROMO_DISMISS_KEY);
  } catch {
    // 写失败只影响下次是否记得，不影响当前页面状态。
  }
}
