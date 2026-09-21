# blog

个人博客，线上地址 [meowv.com](https://meowv.com)。

基于 **Hexo 7**，主题为仓库内的 `hexo-theme-matery`。内容是 `source/_posts/` 下的文章，另有 `source/games/` 下几个独立静态小游戏。

- 用途、结构与命令 → 本文件
- 修改边界、约定与验证要求 → [`AGENTS.md`](./AGENTS.md)
- 仓库级概览与根目录脚本 → [`../README.md`](../README.md)、[`../AGENTS.md`](../AGENTS.md)

## 快速开始

包管理器固定为 **yarn**，锁文件 `yarn.lock`：

```bash
cd blog
yarn install --frozen-lockfile

yarn server   # 本地预览，http://localhost:4000
yarn clean    # 清掉 public/ 与缓存
yarn build    # 生成静态站点到 public/
```

从仓库根目录也可以：`./run.sh blog`（等价 `./run.sh b`）启动开发服务器，`./build.sh blog` 构建并把产物汇总到 `build/meowv.com/`。

新建内容用 Hexo 自带的脚手架（模板在 `scaffolds/`）：

```bash
yarn hexo new post "文章标题"
yarn hexo new page "页面标题"
yarn hexo new draft "草稿标题"
```

## 目录结构

```text
blog/
├─ _config.yml                  Hexo 站点配置（url、permalink、主题、deploy…）
├─ package.json                 scripts 与 Hexo 插件依赖
├─ scaffolds/                   hexo new 模板：post.md / page.md / draft.md
├─ source/
│  ├─ _posts/                   文章，按主题分子目录
│  │  └─ database/ dotnet/ git/ other/ python/ summary/ web/
│  ├─ _data/                    站点共享数据：friends.json、answer-book.json
│  ├─ games/                    跳过 Hexo 渲染的独立静态应用：plonky、ztype
│  ├─ about/ contact/ friends/ categories/ tags/   固定页面
│  ├─ images/                   文章与页面用的图片
│  ├─ 404.md
│  └─ robots.txt
└─ themes/
   └─ hexo-theme-matery/
      ├─ _config.yml            主题配置（菜单、社交链接、评论、CDN…）
      ├─ languages/             多语言文案
      ├─ layout/                EJS 模板
      │  ├─ layout.ejs post.ejs index.ejs 404.ejs …
      │  ├─ _partial/           共用片段
      │  └─ _widget/            侧栏小组件
      └─ source/                主题 CSS、JavaScript、图片与第三方资源
```

`source/tools/`、`source/labs/`、`source/_data/tools.json` 与 `themes/hexo-theme-matery/layout/tools/` 是早期的一批浏览器端小工具（Labs）。**它们已停止维护、不对外放开**，只作为代码留在仓库里，日常改动不需要碰。

## 关键配置

`_config.yml` 中几项值得注意的设置：

| 项                      | 值                        | 说明                                                 |
| ----------------------- | ------------------------- | ---------------------------------------------------- |
| `url`                   | `https://meowv.com`       | 线上地址，改链接与 Sitemap 时以此为准                |
| `permalink`             | `/:title/`                | 文章永久链接只用标题                                 |
| `language` / `timezone` | `zh-CN` / `Asia/Shanghai` |                                                      |
| `theme`                 | `hexo-theme-matery`       | 仓库内主题                                           |
| `skip_render`           | `games/**/*`              | `source/games/` 下的独立应用原样拷贝，不经 Hexo 渲染 |
| `post_asset_folder`     | `true`                    | 每篇文章配一个同名资源目录                           |
| `syntax_highlighter`    | `prismjs`                 | 代码高亮                                             |
| `auto_spacing`          | `true`                    | 中英文之间自动加空格                                 |
| `external_link`         | 开启，`field: site`       | 站外链接在新标签打开                                 |

主题配置在同名主题目录下的 `_config.yml`，菜单项、社交链接、评论组件、CDN 都在那里。

## 独立游戏

`source/games/` 下是完整的静态应用（`plonky`、`ztype`），由 `skip_render: ["games/**/*"]` 跳过 Hexo 渲染、原样拷进产物，因此可以用自己的 HTML / JS 结构，不受主题约束。

## 构建与部署

`yarn build` 生成 `public/`；仓库根目录的 `./build.sh blog` 会把它汇总到 `build/meowv.com/`。

`_config.yml` 里保留了 `deploy: type: git`，但 `package.json` **没有声明 `hexo-deployer-git`**，所以 `yarn deploy` 目前跑不通。仓库实际的发布路径是根目录的 `deploy.sh`（用 SFTP 上传 `build/meowv.com/` 的产物），见 [`../README.md`](../README.md) 的「上传到 Windows Nginx」。

`public/`、`db.json` 是生成内容，不提交 Git。
