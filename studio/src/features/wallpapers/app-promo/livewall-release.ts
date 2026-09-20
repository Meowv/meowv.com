/**
 * 拉取桌面 App 的发布信息（`version.json`）。
 *
 * 之所以把这一步抽成独立模块：`studio/public/data/livewall/` 里**没有** `version.json`
 * （它由 `./build.sh livewall --with-dmg` 写进部署目录），所以本地开发环境里这次请求
 * **必然 404**。降级是常态路径而不是异常路径，必须能被单测覆盖。
 *
 * 约定：本函数**永不 reject**，任何失败都返回兜底数据，绝不阻塞渲染。
 */

import {
  normalizeLivewallRelease,
  type LivewallFeedSource,
  type LivewallRelease,
} from './livewall-meta';

export const LIVEWALL_RELEASE_TIMEOUT_MS = 6000;

export interface LivewallReleaseLoadResult {
  release: LivewallRelease;
  source: LivewallFeedSource;
}

export interface LoadLivewallReleaseOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type LivewallReleaseFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * 读取发布信息。`source` 反映"是否拿到了可用的远端数据"——
 * 即使 HTTP 200，只要归一化后内容不可用，也记作 `fallback`。
 */
export async function loadLivewallRelease(
  fetcher: LivewallReleaseFetcher,
  url: string,
  fallback: LivewallRelease,
  options: LoadLivewallReleaseOptions = {},
): Promise<LivewallReleaseLoadResult> {
  const { timeoutMs = LIVEWALL_RELEASE_TIMEOUT_MS, signal } = options;
  const fallbackResult: LivewallReleaseLoadResult = { release: fallback, source: 'fallback' };

  if (signal?.aborted) return fallbackResult;

  const controller = new AbortController();
  const abortFromOuter = () => controller.abort();
  signal?.addEventListener('abort', abortFromOuter, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = (async (): Promise<LivewallReleaseLoadResult> => {
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) return fallbackResult;
      const payload: unknown = await response.json();
      const release = normalizeLivewallRelease(payload, fallback);
      // 归一化后仍是同一个兜底对象，说明远端数据不可用，不能标成 remote。
      return { release, source: release === fallback ? 'fallback' : 'remote' };
    } catch {
      return fallbackResult;
    }
  })();

  try {
    if (timeoutMs <= 0) return await request;
    // 超时不能只依赖 fetch 对 abort 的反应：即便 fetcher 忽略信号，这里也能按时收口。
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    const result = await Promise.race([request, timeout]);
    return result ?? fallbackResult;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromOuter);
  }
}
