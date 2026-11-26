import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(apiRoot, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(srcRoot)
  .filter(path => path.endsWith('.cs'))
  .filter(path => !path.includes('/obj/') && !path.includes('/bin/'))
  .map(path => ({ path, text: readFileSync(path, 'utf8') }));

test('Application 与 Domain 不依赖 HTTP 宿主类型', () => {
  const violations = sources
    .filter(({ path }) => /\/Application\/|\/Domain\//.test(path))
    .filter(({ text }) => /HttpContext|ClaimsPrincipal|Microsoft\.AspNetCore\.Http/.test(text))
    .map(({ path }) => path);
  assert.deepEqual(violations, []);
});

test('IEndpointModule.MapEndpoints 只承载非 Controller 传输端点', () => {
  const violations = sources
    .filter(({ path }) => path.endsWith('Module.cs') && /void MapEndpoints\(/.test(textOf(path)))
    .filter(({ text }) => /MapGet\(|MapPost\(|MapPut\(|MapDelete\(|MapPatch\(|MapMethods\(/.test(text))
    .map(({ path }) => path);
  assert.deepEqual(violations, []);
});

function textOf(path) {
  return readFileSync(path, 'utf8');
}

test('无传输端点的模块不重复实现 MapEndpoints', () => {
  const violations = sources
    .filter(({ path }) => path.endsWith('Module.cs') && /public void MapEndpoints\(/.test(textOf(path)))
    .filter(({ text }) => !/MapHub</.test(text))
    .map(({ path }) => path);
  assert.deepEqual(violations, []);
});

test('模块项目之间零引用', () => {
  const projects = readdirSync(srcRoot)
    .filter(name => name.startsWith('Meowv.Api.Modules.'))
    .map(name => join(srcRoot, name, `${name}.csproj`));
  for (const project of projects) {
    const text = readFileSync(project, 'utf8');
    const references = [...text.matchAll(/ProjectReference Include="\.\.\/(Meowv\.Api\.Modules\.[^/]+)\//g)].map(match => match[1]);
    assert.deepEqual(references, [], `${project} 不应引用其他模块`);
  }
});

test('共享契约保留 IEndpointModule 默认空 MapEndpoints', () => {
  const contract = readFileSync(join(srcRoot, 'Meowv.Api.SharedKernel', 'IEndpointModule.cs'), 'utf8');
  assert.match(contract, /void MapEndpoints\(IEndpointRouteBuilder endpoints\)\s*\{\s*\}/);
});

test('命名空间与物理目录一致', () => {
  const violations = sources.flatMap(({ path, text }) => {
    const match = text.match(/^namespace\s+([A-Za-z0-9_.]+);/m);
    if (!match) return [];
    const expected = expectedNamespace(path);
    return match[1] === expected ? [] : [`${path}: ${match[1]} != ${expected}`];
  });
  assert.deepEqual(violations, []);
});

test('csproj RootNamespace 与项目边界一致', () => {
  const violations = readdirSync(srcRoot)
    .filter(name => name.startsWith('Meowv.Api'))
    .flatMap(name => {
      const project = join(srcRoot, name, `${name}.csproj`);
      const text = readFileSync(project, 'utf8');
      const match = text.match(/<RootNamespace>([^<]+)<\/RootNamespace>/);
      return match?.[1] === name ? [] : [`${project}: ${match?.[1] ?? 'missing'} != ${name}`];
    });
  assert.deepEqual(violations, []);
});

test('每个文件最多一个顶层类型', () => {
  const violations = sources.flatMap(({ path, text }) => {
    const types = text.split(/\r?\n/).filter(line =>
      /^(?:public|internal|private|protected|sealed|static|abstract|partial|readonly)\b.*\b(?:class|record|interface|enum|struct)\s+[A-Za-z_]/.test(line));
    return types.length > 1 ? [`${path}: ${types.length} types`] : [];
  });
  assert.deepEqual(violations, []);
});

function expectedNamespace(path) {
  const parts = path.slice(srcRoot.length + 1).split('/');
  return [parts[0], ...parts.slice(1, -1)].join('.');
}
