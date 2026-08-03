export interface DemoDocument {
  path: string;
  content: string;
}

export interface DemoAsset {
  name: string;
  path: string;
  url: string;
}

export interface DemoTreeNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  category?: 'markdown' | 'image' | 'other';
  children?: DemoTreeNode[];
}

export const DEMO_WORKSPACE_NAME = 'Blog';

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    path: '技术/.NET/EFCore性能优化.md',
    content: `---
title: EF Core 性能优化实践
date: 2026-07-30
tags:
  - EF Core
  - .NET
  - 性能优化
category: 后端
---

# EF Core 性能优化实践

在业务系统中，EF Core 是非常高效的 ORM 框架，但如果使用不当，也可能引入隐藏的性能问题。本文总结常见问题与优化方式。

## 1. 减少不必要的跟踪

对于只读查询，使用 \`AsNoTracking()\` 可以显著减少内存占用和变更跟踪开销。

## 2. 合理使用 Include

避免过度使用 \`Include\` 导致笛卡尔积，必要时使用拆分查询。

## 3. 查询投影

- 使用 \`Select\` 只读取需要的字段
- 避免加载整个实体
- 为高频条件建立数据库索引

\`\`\`csharp
var list = await _dbContext.Orders
    .AsNoTracking()
    .Where(o => o.IsPaid && o.CreateTime >= start)
    .Select(o => new OrderDto
    {
        Id = o.Id,
        Amount = o.Amount,
        CreateTime = o.CreateTime
    })
    .ToListAsync();
\`\`\`

![EF Core 查询性能对比](../../assets/efcore-performance-chart.png)

## 4. 继续阅读

相关内容：[[Redis缓存实践]]、[[Vue 组合式 API]]。
`,
  },
  {
    path: '技术/.NET/Redis缓存实践.md',
    content: `---
title: Redis 缓存实践
date: 2026-07-28
tags: [Redis, .NET, 缓存]
category: 后端
---

# Redis 缓存实践

缓存不是银弹。优先明确数据一致性、过期策略与降级路径，再决定是否引入 Redis。

## 缓存键

使用可读、可追踪并带版本的缓存键。

## 关联阅读

当查询压力较大时，可结合 [[EF Core 性能优化实践]] 中的投影与只读查询策略。
`,
  },
  {
    path: '前端/Vue组合式API.md',
    content: `---
title: Vue 组合式 API
date: 2026-07-24
tags: [Vue, TypeScript, 前端]
category: 前端
---

# Vue 组合式 API

将同一业务关注点的状态、计算属性与副作用组织在一起，可以让复杂组件更容易维护。

## 推荐结构

\`\`\`ts
const keyword = ref("")
const results = computed(() => search(keyword.value))
\`\`\`

后端查询可参考 [[EF Core 性能优化实践]]。
`,
  },
  {
    path: '生活/Diary.md',
    content: `---
title: 七月随记
date: 2026-07-30
tags: [生活, 随记]
category: 生活
---

# 七月随记

把复杂的事情拆成可验证的小步骤，往往比等待完美时机更有效。

> 写作也是一种整理思考的方式。
`,
  },
  {
    path: 'README.md',
    content: `# Blog

这是一个完全保存在本地文件夹中的 Markdown 工作空间。

- 技术笔记
- 前端实践
- 生活随记

从 [[EF Core 性能优化实践]] 开始阅读。
`,
  },
];

export const DEMO_ASSETS: DemoAsset[] = [
  {
    name: 'efcore-performance-chart.png',
    path: 'assets/efcore-performance-chart.png',
    url: '/markdown-assets/demo/efcore-performance-chart.png',
  },
];

export const DEMO_TREE: DemoTreeNode = {
  kind: 'directory',
  name: DEMO_WORKSPACE_NAME,
  path: '',
  children: [
    {
      kind: 'directory',
      name: '技术',
      path: '技术',
      children: [
        {
          kind: 'directory',
          name: '.NET',
          path: '技术/.NET',
          children: [
            {
              kind: 'file',
              category: 'markdown',
              name: 'EFCore性能优化.md',
              path: '技术/.NET/EFCore性能优化.md',
            },
            {
              kind: 'file',
              category: 'markdown',
              name: 'Redis缓存实践.md',
              path: '技术/.NET/Redis缓存实践.md',
            },
          ],
        },
      ],
    },
    {
      kind: 'directory',
      name: '前端',
      path: '前端',
      children: [
        {
          kind: 'file',
          category: 'markdown',
          name: 'Vue组合式API.md',
          path: '前端/Vue组合式API.md',
        },
      ],
    },
    {
      kind: 'directory',
      name: '生活',
      path: '生活',
      children: [
        {
          kind: 'file',
          category: 'markdown',
          name: 'Diary.md',
          path: '生活/Diary.md',
        },
      ],
    },
    {
      kind: 'file',
      category: 'markdown',
      name: 'README.md',
      path: 'README.md',
    },
  ],
};
