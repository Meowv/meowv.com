import {
  extractRelativeImagePaths,
  extractWikiLinks,
  parseFrontMatter,
  parseMarkdownDocument,
  resolveRelativeAssetPath,
  sanitizeMarkdownHtml,
} from "@/services/markdown";
import { describe, expect, it } from "vitest";

describe("Markdown 解析服务", () => {
  it("解析 Front Matter、正文元数据、大纲和相对图片", () => {
    const source = `---
title: EF Core 性能优化
date: 2026-07-30
tags:
  - .NET
  - EFCore
category: Backend
---
# 查询性能

![图表](../assets/chart.png)

## 查询性能
`;
    const parsed = parseMarkdownDocument(source, {
      path: "posts/database/efcore.md",
      imageResolver: ({ resolvedPath }) =>
        resolvedPath === "posts/assets/chart.png"
          ? "blob:https://md.meowv.com/chart"
          : undefined,
    });

    expect(parsed.metadata).toEqual({
      title: "EF Core 性能优化",
      date: "2026-07-30",
      tags: [".NET", "EFCore"],
      category: "Backend",
    });
    expect(parsed.outline).toEqual([
      {
        id: "查询性能",
        text: "查询性能",
        level: 1,
        lineNumber: 9,
      },
      {
        id: "查询性能-2",
        text: "查询性能",
        level: 2,
        lineNumber: 13,
      },
    ]);
    expect(parsed.relativeImagePaths).toEqual(["../assets/chart.png"]);
    expect(parsed.html).toContain('id="查询性能"');
    expect(parsed.html).toContain('src="blob:https://md.meowv.com/chart"');
  });

  it("渲染表格、代码高亮、Mermaid 占位和双向链接", () => {
    const parsed = parseMarkdownDocument(`# 示例

| 名称 | 数量 |
| --- | ---: |
| Redis | 2 |

\`\`\`typescript
const value: number = 1;
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

查看 [[EFCore优化#索引|EF Core 指南]]。
`);

    expect(parsed.html).toContain("<table>");
    expect(parsed.html).toContain("hljs");
    expect(parsed.html).toContain("language-typescript");
    expect(parsed.html).toContain("mermaid-placeholder");
    expect(parsed.html).toContain("data-mermaid-source=");
    expect(parsed.html).toContain('data-wiki-link="EFCore优化"');
    expect(parsed.html).toContain('data-wiki-anchor="索引"');
    expect(parsed.wikiLinks).toEqual([
      expect.objectContaining({
        target: "EFCore优化",
        anchor: "索引",
        label: "EF Core 指南",
        lineNumber: 16,
      }),
    ]);
  });

  it("清理不安全 HTML 和 URL", () => {
    const parsed = parseMarkdownDocument(`<script>alert(1)</script>
<img src="x" onerror="alert(2)">
[危险链接](javascript:alert(3))
`);

    expect(parsed.html).not.toContain("<script");
    expect(parsed.html).not.toContain("onerror");
    expect(parsed.html).not.toMatch(/href=["']javascript:/u);
    expect(sanitizeMarkdownHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      "<a>x</a>",
    );
  });

  it("无效 Front Matter 不阻断正文预览", () => {
    const source = `---
tags: [unclosed
---
# 正文
`;
    const frontMatter = parseFrontMatter(source);
    const parsed = parseMarkdownDocument(source);

    expect(frontMatter.error).toContain("Front Matter 解析失败");
    expect(parsed.warnings[0]).toContain("Front Matter 解析失败");
    expect(parsed.html).toContain("正文");
  });

  it("提取路径时忽略远程图片，并阻止逃逸工作空间", () => {
    const source = `![local](images/a.png)
![parent](../assets/b.webp)
![remote](https://example.com/c.png)
`;

    expect(extractRelativeImagePaths(source)).toEqual([
      "images/a.png",
      "../assets/b.webp",
    ]);
    expect(
      resolveRelativeAssetPath("posts/article.md", "../assets/b.webp"),
    ).toBe("assets/b.webp");
    expect(resolveRelativeAssetPath("article.md", "../secret.png")).toBeNull();
  });

  it("双向链接提取跳过代码块和行内代码", () => {
    const links = extractWikiLinks(`[[有效]]

\`[[行内代码]]\`

\`\`\`md
[[代码块]]
\`\`\`

![[assets/image.png]]
`);

    expect(links.map((link) => link.target)).toEqual([
      "有效",
      "assets/image.png",
    ]);
    expect(links[1]?.embedded).toBe(true);
  });
});
