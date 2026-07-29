# 字帖生成

一个可静态部署的在线 A4 练字纸生成器，支持在浏览器中编辑内容、预览版式，并导出为 PNG、PDF 或用于打印的页面。

线上地址：[zt.meowv.com](https://zt.meowv.com)

## 功能

- 汉字、词语、中文段落、笔画练习
- 拼音、英文字母、英文单词与段落、数字练习
- 控笔图案练习
- 田字格、米字格、回宫格、九宫格、横线格、四线格等版式
- 可调整纸张边距、字格尺寸、行列数、描红、字体、颜色和留白
- 支持多页预览、PNG、PDF、ZIP 导出及浏览器打印
- 将练习设置保存在浏览器本地存储中
- 支持 Chrome 的本地字体访问能力（需用户授权）

## 技术栈

- [Vinext](https://github.com/cloudflare/vinext) / Next.js 16
- React 19 + TypeScript
- Canvas 绘制与浏览器端文件导出
- `hanzi-writer-data` 提供汉字笔顺数据
- `pinyin-pro` 提供拼音处理

项目使用 Next 静态导出模式，构建产物可部署到任意静态站点托管服务。

## 本地开发

前置要求：Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

开发命令会先同步运行期需要的汉字笔顺数据，再启动本地 Vinext 开发服务器。

## 构建与预览

```bash
# 仅同步汉字笔顺数据
npm run prepare:data

# 生成静态站点到 dist/
npm run build

# 预览最近一次构建产物
npm run start
```

`public/hanzi-data/` 和 `dist/` 都是生成内容，已被 Git 忽略，不应手动编辑或提交。

## 项目结构

```text
app/
  components/     共享界面组件与字帖编辑器
  config/         页面内容配置
  lib/            字帖分页、Canvas 渲染、字体与类型定义
  */page.tsx      各练习模式的路由页面
public/
  brand/          品牌资源
  fonts/          内置练习字体
  hanzi-data/     由脚本生成的笔顺数据
scripts/
  sync-hanzi-data.mjs  笔顺数据同步脚本
```

## 路由

| 路径 | 练习模式 |
| --- | --- |
| `/hanzi/` | 汉字 |
| `/cizu/` | 词语 |
| `/duanluo/` | 中文段落 |
| `/bihua/` | 笔画 |
| `/pinyin/` | 拼音 |
| `/alphabet/` | 英文字母 |
| `/word/` | 英文单词 |
| `/paragraph/` | 英文段落 |
| `/number/` | 数字 |
| `/pen-control/` | 控笔 |

## 开发说明

- 路由页放在 `app/`；可复用 UI 放在 `app/components/`；字帖生成与渲染逻辑放在 `app/lib/`。
- 静态部署依赖 `next.config.ts` 中的 `output: "export"` 与 `trailingSlash: true`，修改时需要确认生成资源和路由仍可在根路径下访问。
- 字帖导出与打印由浏览器端 Canvas 完成。涉及渲染或分页的改动，请在浏览器中检查多页、导出和打印结果。
- 项目暂未配置专用的测试、Lint 或格式化命令。TypeScript 改动可执行：

  ```bash
  npx tsc --noEmit
  ```

## 贡献

请遵循仓库中的 [AGENTS.md](./AGENTS.md) 约定：保持改动聚焦，避免提交生成文件或本地环境配置；涉及静态输出、Canvas 渲染和分页时，进行相应的定向验证。

## 许可证

本仓库尚未声明许可证。使用、分发或二次开发前，请先联系仓库维护者确认授权方式。
