import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "node_modules", "hanzi-writer-data");
const targetDir = path.join(projectRoot, "public", "hanzi-data");
const markerPath = path.join(targetDir, ".version");
const packageJson = JSON.parse(
  await readFile(path.join(sourceDir, "package.json"), "utf8"),
);

let isCurrent = false;
try {
  isCurrent = (await readFile(markerPath, "utf8")).trim() === packageJson.version;
} catch {
  isCurrent = false;
}

if (!isCurrent) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const jsonEntries = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json"),
  );
  for (let index = 0; index < jsonEntries.length; index += 64) {
    await Promise.all(
      jsonEntries.slice(index, index + 64).map((entry) =>
        cp(path.join(sourceDir, entry.name), path.join(targetDir, entry.name)),
      ),
    );
  }
  await writeFile(markerPath, `${packageJson.version}\n`, "utf8");
}

// 笔顺数据在开发与构建前从依赖包同步，避免将大量生成文件提交到项目中。
console.log(`Hanzi data ${packageJson.version} ready (${isCurrent ? "cached" : "synced"}).`);
