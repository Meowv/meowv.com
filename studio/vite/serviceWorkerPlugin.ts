import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const studioRoot = fileURLToPath(new URL('..', import.meta.url));
const serviceWorkerSource = path.join(studioRoot, 'public', 'sw.js');
const serviceWorkerOutput = path.join(studioRoot, 'dist', 'sw.js');

/** 与 `public/sw.js` 里的占位符必须逐字一致。 */
const CACHE_VERSION_PLACEHOLDER = '__STUDIO_CACHE_VERSION__';

/**
 * 把 Service Worker 的缓存版本改成**构建期注入**。
 *
 * 为什么必须这么做：`public/sw.js` 是原样拷进 `dist/` 的，内容不参与构建哈希。
 * 于是发版后浏览器逐字节比对 `sw.js` 发现它没变 → 不触发 SW 更新 → `activate` 里的
 * 旧缓存清理**永远不执行**，历史版本的资源在 Cache Storage 里无限累积。
 *
 * 版本号取「本次全部产物文件名 + SW 模板」的摘要：
 * - 产物文件名自带内容哈希，所以任何内容变化都会让版本变化（缓存该清就清）；
 * - 内容完全没变时版本不变（不会平白发一次全量缓存清理）。
 */
export function serviceWorkerPlugin(): Plugin {
  const template = readFileSync(serviceWorkerSource, 'utf8');
  let cacheVersion = '';

  return {
    name: 'studio-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const outputNames = Object.keys(bundle)
        .filter((fileName) => fileName !== 'sw.js')
        .sort();
      cacheVersion = createHash('sha256')
        .update([...outputNames, template].join('\n'))
        .digest('hex')
        .slice(0, 12);
    },
    async closeBundle() {
      // closeBundle 在所有文件（含 publicDir 拷贝）落盘之后执行，
      // 所以这里改的是最终产物，不会被 public/sw.js 的原样拷贝覆盖。
      if (!cacheVersion) return;

      const source = await readFile(serviceWorkerOutput, 'utf8');
      if (!source.includes(CACHE_VERSION_PLACEHOLDER)) {
        this.warn(
          `${path.relative(studioRoot, serviceWorkerOutput)} 里没有找到 ${CACHE_VERSION_PLACEHOLDER}，缓存版本未注入。`,
        );
        return;
      }
      await writeFile(
        serviceWorkerOutput,
        source.replaceAll(CACHE_VERSION_PLACEHOLDER, cacheVersion),
      );
    },
  };
}
