# 小工具模式

## 文件映射

每个普通 Labs 工具由三部分组成：

| 职责           | 路径                                               |
| -------------- | -------------------------------------------------- |
| Labs 卡片数据  | `source/_data/tools.json`                          |
| Hexo 页面入口  | `source/tools/<slug>/index.md`                     |
| 页面布局与逻辑 | `themes/hexo-theme-matery/layout/tools/<slug>.ejs` |

`source/labs/index.md` 只声明 `layout: "labs"`，工具卡片由 `layout/labs.ejs` 遍历 `site.data.tools` 自动生成，无需逐页修改 Labs 模板。

## 注册与页面入口

注册对象使用以下形状：

```json
{
  "slug": "example-tool",
  "name": "示例工具",
  "description": "一句话说明核心用途",
  "emoji": "🧰",
  "url": "/tools/example-tool"
}
```

页面入口保持最小化：

```yaml
---
title: 示例工具
date: YYYY-MM-DD 00:00:00
layout: "tools/example-tool"
toolSlug: example-tool
---
```

## EJS 骨架

```ejs
<%- partial('_partial/bg-cover') %>

<style>
  .tool-container { margin-top: -50px; margin-bottom: 30px; }
  .tool-container .card { border-radius: 8px; }
  @media only screen and (max-width: 601px) {
    .tool-container { margin-top: -30px; }
  }
</style>

<main class="content">
  <div class="container tool-container">
    <div class="card">
      <%- partial('_partial/tool-header') %>
      <div class="card-content">
        <!-- 工具界面 -->
      </div>
    </div>
    <div class="card">
      <% if (theme.valine && theme.valine.enable) { %>
      <%- partial('_partial/valine') %>
      <% } %>
    </div>
  </div>
</main>

<script>
  $(document).ready(function() {
    // 工具逻辑
  });
</script>
```

## 视觉与交互

- 工具标题与描述由 `_partial/tool-header` 统一渲染，不要在页面布局中添加个性化标题结构或样式。
- 主题强调色使用 `#5a9600`，渐变按钮可搭配 `#7ccd00`。
- 输入框常用浅灰背景、`2px` 边框、`10px` 圆角；注意覆盖 Materialize 的全局 input 样式。
- 双栏内容在 `max-width: 601px` 下改为单栏，避免固定宽度和横向滚动。
- 空结果显示 `—`；复制成功短暂切换为勾选图标；复制失败再使用 Toast。
- 输入过程中的错误应靠近输入框显示，清空或非法输入时同步清除旧结果。

## 相似实现索引

- 双栏文本转换：`themes/hexo-theme-matery/layout/tools/url-encode.ejs`
- 标签页、预设与结果卡片：`themes/hexo-theme-matery/layout/tools/timestamp.ejs`
- 多行解析、本地草稿与安全表达式求值：`themes/hexo-theme-matery/layout/tools/calculation-paper.ejs`
- 精确字符串转换、实时结果与复制：`themes/hexo-theme-matery/layout/tools/number-converter.ejs`

选择最接近需求的实现作为起点，只复用稳定结构，不复制无关功能。
