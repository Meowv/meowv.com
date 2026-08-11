import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const configFile = path.join(sourceRoot, 'features/tools/config/tools.ts');
const toolsRoot = path.join(sourceRoot, 'features/tools/tools');
const retiredFeatureRoots = ['image', 'pdf', 'ocr'].map((name) =>
  path.join(sourceRoot, 'features', name),
);
const errors = [];

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function readToolSeeds() {
  const sourceText = fs.readFileSync(configFile, 'utf8');
  const sourceFile = ts.createSourceFile(
    configFile,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let initializer;

  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'toolSeeds') {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    errors.push('无法从 tools.ts 读取 toolSeeds。');
    return [];
  }

  const seeds = [];
  for (const category of initializer.properties) {
    if (!ts.isPropertyAssignment(category) || !ts.isArrayLiteralExpression(category.initializer)) {
      continue;
    }
    for (const entry of category.initializer.elements) {
      if (!ts.isArrayLiteralExpression(entry)) continue;
      const [id, name, , description] = entry.elements;
      if (
        !id ||
        !name ||
        !description ||
        !ts.isStringLiteralLike(id) ||
        !ts.isStringLiteralLike(name) ||
        !ts.isStringLiteralLike(description)
      ) {
        errors.push(`分类 ${category.name.getText(sourceFile)} 存在无效工具配置。`);
        continue;
      }
      seeds.push({ id: id.text, name: name.text, description: description.text });
    }
  }
  return seeds;
}

const seeds = readToolSeeds();
const ids = seeds.map((seed) => seed.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) {
  errors.push(`工具 ID 重复：${[...new Set(duplicateIds)].join(', ')}`);
}

for (const seed of seeds) {
  if (!seed.name.trim()) errors.push(`工具 ${seed.id} 缺少名称。`);
  if (!seed.description.trim() || /^(这里是描述|todo|待补充)$/i.test(seed.description.trim())) {
    errors.push(`工具 ${seed.id} 缺少有效描述。`);
  }
}

const toolDirectories = fs
  .readdirSync(toolsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
  .map((entry) => entry.name)
  .sort();
const implementationIds = toolDirectories.filter((id) =>
  fs.existsSync(path.join(toolsRoot, id, 'index.vue')),
);

const missingImplementations = ids.filter((id) => !implementationIds.includes(id));
const extraImplementations = toolDirectories.filter((id) => !ids.includes(id));
if (missingImplementations.length) {
  errors.push(`缺少工具入口：${missingImplementations.join(', ')}`);
}
if (extraImplementations.length) {
  errors.push(`存在未注册工具入口：${extraImplementations.join(', ')}`);
}

for (const retiredRoot of retiredFeatureRoots) {
  if (walkFiles(retiredRoot).length) {
    errors.push(`旧功能目录仍包含文件：${path.relative(projectRoot, retiredRoot)}`);
  }
}

const sourceFiles = walkFiles(sourceRoot).filter((file) => /\.(?:css|ts|tsx|vue)$/.test(file));
const retiredImportPattern = /(?:@\/|\/)?features\/(?:image|pdf|ocr)(?:\/|['"`])/;
const retiredRoutePattern = /['"`]\/(?:image(?:\/[^'"`]*)?|pdf(?:\/[^'"`]*)?|ocr)['"`]/;
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (retiredImportPattern.test(source)) {
    errors.push(`仍引用旧功能路径：${path.relative(projectRoot, file)}`);
  }
  if (retiredRoutePattern.test(source)) {
    errors.push(`仍引用旧页面地址：${path.relative(projectRoot, file)}`);
  }
}

if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Tools audit passed: ${ids.length} unique tools and ${implementationIds.length} entries.`,
  );
}
