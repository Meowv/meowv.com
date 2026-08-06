# Meowv Web Projects

这是 Meowv 旗下 3 个 Web 项目的统一代码仓库：Blog、Meowv Studio 与 Zitie。各项目位于独立目录，拥有各自的依赖、开发命令和构建产物；它们不是统一的 npm/pnpm workspace，根目录提供统一的启动和编译脚本。

所有项目均在本地完成检查与生产构建，再将根目录 `build/` 中对应域名的静态产物自行部署到服务器。仓库不使用 GitHub Actions、OpenAI Sites 或其他托管平台执行构建和发布。

## 项目概览

| 目录       | 项目                 | 技术栈                              | 状态   | 地址                                         |
| ---------- | -------------------- | ----------------------------------- | ------ | -------------------------------------------- |
| `blog/`    | 个人博客与 Labs 工具 | Hexo 7、EJS、Stylus                 | 已上线 | [meowv.com](https://meowv.com)               |
| `studio/`  | Meowv Studio         | Vue 3、TypeScript、Vite、Vue Router | 已上线 | [studio.meowv.com](https://studio.meowv.com) |
| `zitie/`   | 在线字帖生成         | Vinext、Next.js、React、TypeScript  | 已上线 | [zt.meowv.com](https://zt.meowv.com)         |

## 仓库结构

```text
.
├── blog/       # 博客、文章、独立游戏和 Labs 工具
├── studio/     # 统一的浏览器本地工作台
├── zitie/      # 浏览器端字帖生成与导出应用
├── AGENTS.md   # 全仓库协作与修改约定
└── README.md   # 项目总览
```

3 个目录不是统一的 npm/pnpm workspace。安装依赖、开发、检查和构建时，应先进入目标项目目录，不要在仓库根目录混用包管理命令。

## macOS 一键脚本

根目录提供 `run.sh` 和 `build.sh`，仓库已保留可执行权限。如果通过压缩包等方式传输后权限丢失，可重新执行：

```bash
chmod +x run.sh build.sh
```

### 启动项目

不传参数或传入 `all` 时并行启动全部项目：

```bash
./run.sh
./run.sh all
```

传入项目全称或简写时只启动指定项目：

```bash
./run.sh blog    # 或 ./run.sh b
./run.sh studio  # 或 ./run.sh s
./run.sh zitie   # 或 ./run.sh z
```

固定开发端口：

| 项目   | 地址                    |
| ------ | ----------------------- |
| Blog   | `http://localhost:4000` |
| Studio | `http://localhost:4001` |
| Zitie  | `http://localhost:4002` |

脚本不会自动安装依赖。启动全部项目后，按 `Ctrl+C` 会统一停止三个开发服务器。

### 编译项目

不传参数或传入 `all` 时依次编译全部项目：

```bash
./build.sh
./build.sh all
```

传入项目全称或简写时只编译并更新指定项目：

```bash
./build.sh blog    # 或 ./build.sh b
./build.sh studio  # 或 ./build.sh s
./build.sh zitie   # 或 ./build.sh z
```

编译产物统一发布到根目录 `build/`：

```text
build/
├── meowv.com/        # blog/public/
├── studio.meowv.com/ # studio/dist/
└── zt.meowv.com/     # zitie/dist/client/
```

全量编译时，三个项目都成功后才会替换原有 `build/`。单项目编译只替换对应域名目录，不会修改其他项目的已有产物。`build/`、临时暂存目录和备份目录均已加入 Git 忽略。

## 环境与常用命令

### Blog

- 环境：Node.js；依赖锁文件为 `yarn.lock`
- 安装：`cd blog && yarn install --frozen-lockfile`
- 开发：`yarn server`
- 构建：`yarn clean && yarn build`
- 产物：`blog/public/`

站点内容位于 `blog/source/`，主题模板与资源位于 `blog/themes/hexo-theme-matery/`。文章放在 `source/_posts/`；独立页面和静态资源也从 `source/` 管理。`source/games/` 下的独立应用跳过 Hexo 渲染。

一个常规 Labs 工具通常包含：

- `source/tools/<slug>/index.md`
- `themes/hexo-theme-matery/layout/tools/<slug>.ejs`
- `source/_data/tools.json` 中的入口配置

### Meowv Studio

- 环境：Node.js `>= 22.12.0`、pnpm `11.9.0`
- 安装：`cd studio && pnpm install --frozen-lockfile`
- 开发：`pnpm dev`
- 类型检查：`pnpm typecheck`
- 代码检查：`pnpm lint`
- 生产构建：`pnpm build`
- 产物：`studio/dist/`

Studio 在同一个应用壳和域名下提供浏览器本地工作能力。用户文件不会上传；文件读取、编辑、导出和资源释放必须保留现有的本地处理与授权边界。

### Zitie

- 环境：Node.js `>= 22.13.0`、npm
- 安装：`cd zitie && npm ci`
- 开发：`npm run dev`
- 类型检查：`npx tsc --noEmit`
- 生产构建：`npm run build`
- 预览构建：`npm run start`
- 构建目录：`zitie/dist/`
- 汇总部署产物：`zitie/dist/client/`（不复制 `dist/server/`）

字帖应用使用浏览器 Canvas 完成分页、绘制、打印，以及 PNG、PDF、ZIP 导出。路由页位于 `zitie/app/`，共享组件位于 `app/components/`，分页、绘制、字体和导出逻辑位于 `app/lib/`。`npm run dev` 和 `npm run build` 会先运行 `scripts/sync-hanzi-data.mjs`，生成运行时所需的 `public/hanzi-data/`。

## 隐私与安全边界

Studio 和 Zitie 都以浏览器本地处理为核心。修改相关功能时必须保持以下边界：

- 不把用户选择的文件、图片或其内容发送到第三方服务。
- 不在日志、统计信息或 URL 中记录文件内容和敏感文件信息。
- 不执行不受信任的主动内容。
- 新增外部服务、文件上传、远程转换或遥测前，必须先明确说明并取得授权。

## 生成内容

以下目录或文件由安装、开发或构建过程生成，不应手动修改或提交：

- 通用：`node_modules/`、`.DS_Store`
- Blog：`public/`、`db.json`
- Studio：`dist/`
- Zitie：`public/hanzi-data/`、`dist/`、`.vinext/`、`.next/`、`*.tsbuildinfo`

## 开发与发布

- 修改只应落在目标项目及必要的根目录文档中，避免顺手重构其他项目。
- 使用目标项目现有的包管理器和锁文件，不跨项目安装依赖。
- 根据改动范围执行类型、Lint、单元测试或浏览器检查；完整构建不是所有小改动的默认步骤。
- `yarn deploy`、生产环境部署、Nginx 修改、域名切换和远程资源操作必须在明确授权后执行。
- 当前仓库没有统一许可证；使用、分发或二次开发前，应分别确认各项目的授权情况。

更具体的协作规则见根目录 [AGENTS.md](./AGENTS.md)。

近期迭代中沉淀的本地处理、界面验收、生产验证和交付实践见 [docs/engineering-experience.md](./docs/engineering-experience.md)。
