import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src');
const configFile = path.join(sourceRoot, 'features/tools/tools.ts');
const linksConfigFile = path.join(projectRoot, 'public/tools-links.json');
const toolsRoot = path.join(sourceRoot, 'features/tools/tools');
const retiredFeatureRoots = ['image', 'pdf', 'ocr'].map((name) =>
  path.join(sourceRoot, 'features', name),
);
const errors = [];
const categoryIds = new Set();

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function unwrapExpression(node) {
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function readToolCategorySeeds() {
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
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'toolCategorySeeds') {
      initializer = node.initializer ? unwrapExpression(node.initializer) : undefined;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    errors.push('无法从 tools.ts 读取 toolCategorySeeds。');
    return [];
  }

  const seeds = [];
  for (const category of initializer.properties) {
    if (!ts.isPropertyAssignment(category)) {
      continue;
    }

    const categoryInitializer = unwrapExpression(category.initializer);
    if (!ts.isObjectLiteralExpression(categoryInitializer)) continue;
    categoryIds.add(category.name.getText(sourceFile).replace(/^['"]|['"]$/g, ''));

    const toolsProperty = categoryInitializer.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'tools',
    );
    if (!toolsProperty || !ts.isPropertyAssignment(toolsProperty)) {
      errors.push(`分类 ${category.name.getText(sourceFile)} 缺少 tools 配置。`);
      continue;
    }

    const toolsInitializer = unwrapExpression(toolsProperty.initializer);
    if (!ts.isArrayLiteralExpression(toolsInitializer)) {
      errors.push(`分类 ${category.name.getText(sourceFile)} 的 tools 配置无效。`);
      continue;
    }

    for (const entry of toolsInitializer.elements) {
      if (!ts.isObjectLiteralExpression(entry)) continue;
      const properties = new Map(
        entry.properties
          .filter((property) => ts.isPropertyAssignment(property))
          .map((property) => [property.name.getText(sourceFile), property.initializer]),
      );
      const id = properties.get('id');
      const name = properties.get('name');
      const description = properties.get('description');
      const icon = properties.get('icon');
      if (
        !id ||
        !name ||
        !description ||
        !icon ||
        !ts.isStringLiteralLike(id) ||
        !ts.isStringLiteralLike(name) ||
        !ts.isStringLiteralLike(description) ||
        !ts.isStringLiteralLike(icon)
      ) {
        errors.push(`分类 ${category.name.getText(sourceFile)} 存在无效工具配置。`);
        continue;
      }
      seeds.push({ id: id.text, name: name.text, description: description.text });
    }
  }
  return seeds;
}

function readLinkSeeds(internalIds) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(linksConfigFile, 'utf8'));
  } catch {
    errors.push('无法读取 public/tools-links.json。');
    return [];
  }

  if (!payload || payload.version !== 1 || !Array.isArray(payload.links)) {
    errors.push('public/tools-links.json 必须包含 version: 1 和 links 数组。');
    return [];
  }

  const knownIds = new Set(internalIds);
  const links = [];
  for (const link of payload.links) {
    const iconValid =
      typeof link?.icon === 'string'
        ? Boolean(link.icon.trim())
        : typeof link?.icon?.url === 'string' &&
          (/^https:\/\//.test(link.icon.url) || link.icon.url.startsWith('/'));
    const urlValid =
      typeof link?.url === 'string' && (/^https:\/\//.test(link.url) || link.url.startsWith('/'));

    if (
      !link ||
      typeof link.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(link.id) ||
      knownIds.has(link.id) ||
      !categoryIds.has(link.category) ||
      typeof link.name !== 'string' ||
      !link.name.trim() ||
      typeof link.description !== 'string' ||
      !link.description.trim() ||
      !iconValid ||
      !urlValid
    ) {
      errors.push(`链接工具 ${link?.id ?? '未知'} 配置无效。`);
      continue;
    }

    knownIds.add(link.id);
    links.push(link);
  }
  return links;
}

const seeds = readToolCategorySeeds();
const ids = seeds.map((seed) => seed.id);
const linkSeeds = readLinkSeeds(ids);
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
    `Tools audit passed: ${ids.length} internal tools, ${linkSeeds.length} links and ${implementationIds.length} entries.`,
  );
}
