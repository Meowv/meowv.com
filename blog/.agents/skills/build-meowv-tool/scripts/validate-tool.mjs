#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const slug = process.argv[2];
const root = process.cwd();
const errors = [];
const warnings = [];

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('用法：node .agents/skills/build-meowv-tool/scripts/validate-tool.mjs <slug>');
  process.exit(1);
}

const files = {
  registry: path.join(root, 'source/_data/tools.json'),
  page: path.join(root, 'source/tools', slug, 'index.md'),
  layout: path.join(root, 'themes/hexo-theme-matery/layout/tools', slug + '.ejs'),
  header: path.join(root, 'themes/hexo-theme-matery/layout/_partial/tool-header.ejs')
};

function read(label, file) {
  if (!fs.existsSync(file)) {
    errors.push(`缺少${label}：${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkTrailingWhitespace(label, source) {
  source.split(/\r?\n/).forEach((line, index) => {
    if (/[\t ]+$/.test(line)) errors.push(`${label} 第 ${index + 1} 行存在行尾空白`);
  });
}

const registrySource = read('工具注册文件', files.registry);
const pageSource = read('页面入口', files.page);
const layoutSource = read('EJS 布局', files.layout);
const headerSource = read('公共标题组件', files.header);

if (registrySource) {
  try {
    const tools = JSON.parse(registrySource);
    const matches = tools.filter(tool => tool.slug === slug);
    if (matches.length !== 1) errors.push(`tools.json 中 slug=${slug} 应且只能出现一次`);
    if (matches.length === 1) {
      const tool = matches[0];
      if (tool.url !== `/tools/${slug}`) errors.push(`工具 URL 应为 /tools/${slug}`);
      for (const key of ['name', 'description', 'emoji']) {
        if (!tool[key]) errors.push(`工具注册缺少 ${key}`);
      }
    }
  } catch (error) {
    errors.push(`tools.json 不是有效 JSON：${error.message}`);
  }
}

if (pageSource) {
  const escapedSlug = escapeRegExp(slug);
  if (!new RegExp(`^layout:\\s*["']?tools/${escapedSlug}["']?\\s*$`, 'm').test(pageSource)) {
    errors.push(`页面 layout 应为 tools/${slug}`);
  }
  if (!new RegExp(`^toolSlug:\\s*${escapedSlug}\\s*$`, 'm').test(pageSource)) {
    errors.push(`页面 toolSlug 应为 ${slug}`);
  }
  if (!/^title:\s*\S.*$/m.test(pageSource)) errors.push('页面入口缺少 title');
}

if (layoutSource) {
  try {
    require('ejs').compile(layoutSource);
  } catch (error) {
    errors.push(`EJS 模板语法错误：${error.message}`);
  }

  for (const marker of ["partial('_partial/bg-cover')", "partial('_partial/tool-header')", "partial('_partial/valine')"]) {
    if (!layoutSource.includes(marker)) errors.push(`EJS 布局缺少约定内容：${marker}`);
  }

  const inlineScriptSource = layoutSource.replace(/<script\b(?=[^>]*\bsrc\s*=)[\s\S]*?<\/script>/g, '');
  const scripts = [...inlineScriptSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  scripts.forEach((matched, index) => {
    if (matched[1].includes('<%')) {
      warnings.push(`第 ${index + 1} 个页面脚本包含 EJS 标签，已跳过 JavaScript 语法检查`);
      return;
    }
    try {
      new Function(matched[1]);
    } catch (error) {
      errors.push(`第 ${index + 1} 个页面脚本语法错误：${error.message}`);
    }
  });
}

if (headerSource) {
  try {
    require('ejs').compile(headerSource);
  } catch (error) {
    errors.push(`公共标题组件语法错误：${error.message}`);
  }

  for (const marker of ['site.data.tools', 'page.toolSlug']) {
    if (!headerSource.includes(marker)) errors.push(`公共标题组件缺少约定内容：${marker}`);
  }
}

for (const [label, file] of Object.entries(files)) {
  if (fs.existsSync(file)) checkTrailingWhitespace(label, fs.readFileSync(file, 'utf8'));
}

warnings.forEach(message => console.warn(`警告：${message}`));
if (errors.length) {
  errors.forEach(message => console.error(`错误：${message}`));
  process.exit(1);
}

console.log(`通过：${slug} 的注册、页面入口、EJS 与页面脚本检查均正常`);
