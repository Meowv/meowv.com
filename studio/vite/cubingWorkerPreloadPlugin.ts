import { posix } from 'node:path';
import type { Plugin } from 'vite';

type BuildChunk = {
  type: 'chunk';
  fileName: string;
  code: string;
  imports: string[];
  dynamicImports: string[];
  exports: string[];
  isEntry: boolean;
};

const WORKER_PRELOAD_FILE = 'assets/cubing-worker-preload.js';

function relativeSpecifier(from: string, to: string): string {
  const relative = posix.relative(posix.dirname(from), to);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function replaceSpecifier(code: string, source: string, target: string): string {
  let result = code;
  for (const quote of ['"', "'", '`']) {
    result = result.split(`${quote}${source}${quote}`).join(`${quote}${target}${quote}`);
  }
  return result;
}

export function cubingWorkerPreloadPlugin(): Plugin {
  return {
    name: 'studio-cubing-worker-preload',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk') as BuildChunk[];
      const workerEntry = chunks.find((chunk) => chunk.exports.includes('WORKER_ENTRY_FILE_URL'));
      if (!workerEntry) return;

      const workerDependencies = new Set<string>();
      const appEntries = new Set<string>();
      const visit = (fileName: string): void => {
        const chunk = bundle[fileName];
        if (!chunk || chunk.type !== 'chunk') return;
        for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
          const dependencyChunk = bundle[dependency];
          if (!dependencyChunk || dependencyChunk.type !== 'chunk') continue;
          if (dependencyChunk.isEntry) {
            appEntries.add(dependency);
            continue;
          }
          if (dependency === workerEntry.fileName || workerDependencies.has(dependency)) continue;
          workerDependencies.add(dependency);
          visit(dependency);
        }
      };
      visit(workerEntry.fileName);

      const cloneNames = new Map(
        [...workerDependencies].map((fileName) => [
          fileName,
          `assets/cubing-worker-${posix.basename(fileName)}`,
        ]),
      );

      const rewriteWorkerCode = (code: string, ownerFileName: string): string => {
        let result = code;
        for (const [sourceFileName, targetFileName] of cloneNames) {
          result = replaceSpecifier(
            result,
            relativeSpecifier(ownerFileName, sourceFileName),
            relativeSpecifier(ownerFileName, targetFileName),
          );
        }
        for (const entryFileName of appEntries) {
          result = replaceSpecifier(
            result,
            relativeSpecifier(ownerFileName, entryFileName),
            relativeSpecifier(ownerFileName, WORKER_PRELOAD_FILE),
          );
        }
        return result.replaceAll('__VITE_PRELOAD__', 'void 0');
      };

      this.emitFile({
        type: 'asset',
        fileName: WORKER_PRELOAD_FILE,
        source: 'export function t(factory) { return factory(); }\n',
      });

      for (const [sourceFileName, targetFileName] of cloneNames) {
        const sourceChunk = bundle[sourceFileName];
        if (!sourceChunk || sourceChunk.type !== 'chunk') continue;
        this.emitFile({
          type: 'asset',
          fileName: targetFileName,
          source: rewriteWorkerCode(sourceChunk.code, sourceFileName),
        });
      }

      workerEntry.code = rewriteWorkerCode(workerEntry.code, workerEntry.fileName);
    },
  };
}
