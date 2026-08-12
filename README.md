# Meowv Web Projects

Meowv 的 Web 项目仓库，包含 Blog、Meowv Studio 和 Zitie。三个项目彼此独立，不是 npm/pnpm workspace；依赖安装、开发和构建命令都应在对应目录中执行。

生产构建在本地完成，根目录脚本会把静态产物汇总到 `build/`，再由维护者自行部署。仓库不通过 GitHub Actions、OpenAI Sites 或其他托管平台构建和发布。

## 项目概览

| 目录      | 项目                 | 技术栈                              | 线上地址                                     |
| --------- | -------------------- | ----------------------------------- | -------------------------------------------- |
| `blog/`   | 个人博客与 Labs 工具 | Hexo 7、EJS、Stylus                 | [meowv.com](https://meowv.com)               |
| `studio/` | Meowv Studio         | Vue 3、TypeScript、Vite、Vue Router | [studio.meowv.com](https://studio.meowv.com) |
| `zitie/`  | 在线字帖生成         | Vinext、Next.js、React、TypeScript  | [zt.meowv.com](https://zt.meowv.com)         |

```text
.
├── blog/       # 博客、文章、独立游戏和 Labs 工具
├── studio/     # 浏览器本地工作台
├── zitie/      # 字帖生成与导出应用
├── run.sh      # 开发环境启动脚本
├── build.sh    # 生产构建与产物汇总脚本
├── AGENTS.md   # 全仓库协作约定
└── README.md   # 项目说明
```

## 环境与依赖

建议使用 Node.js `>= 22.13.0`，同时安装各项目对应的包管理器。首次运行前分别安装依赖：

```bash
(cd blog && yarn install --frozen-lockfile)
(cd studio && pnpm install --frozen-lockfile)
(cd zitie && npm ci)
```

Studio 固定使用 pnpm `11.9.0`。三个项目拥有独立锁文件，不要在仓库根目录统一安装依赖或混用包管理器。

## 根目录脚本

脚本面向 macOS Bash，并已保留可执行权限。若权限在文件传输后丢失，可执行：

```bash
chmod +x run.sh build.sh
```

### 启动

不传参数或单独传入 `all` 时，并行启动全部项目：

```bash
./run.sh
./run.sh all
```

也可以传入一个或多个项目，参数支持全称和简写；重复参数会自动去重：

```bash
./run.sh blog          # 等同于 ./run.sh b
./run.sh studio zitie  # 等同于 ./run.sh s z
```

| 参数           | 本地地址                |
| -------------- | ----------------------- |
| `blog` / `b`   | `http://localhost:4000` |
| `studio` / `s` | `http://localhost:4001` |
| `zitie` / `z`  | `http://localhost:4002` |

脚本不会自动安装依赖。启动前会检查固定端口，并停止占用端口的本机进程；运行前请确认这些进程可以结束。并行启动后，按 `Ctrl+C` 会停止本次启动的全部开发服务器。

### 构建

构建参数与启动脚本相同：

```bash
./build.sh
./build.sh all
./build.sh blog
./build.sh studio zitie
```

产物映射如下：

```text
build/
├── meowv.com/        # blog/public/
├── studio.meowv.com/ # studio/dist/
└── zt.meowv.com/     # zitie/dist/client/
```

全量构建会在三个项目全部成功后替换整个 `build/`。指定项目构建会按参数顺序执行，只替换对应域名目录并保留其他产物。Zitie 仅汇总 `dist/client/`，不复制 `dist/server/`。

## 单项目命令

### Blog

```bash
cd blog
yarn server
yarn clean && yarn build
```

- 内容：`source/`
- 文章：`source/_posts/`
- Labs 注册：`source/_data/tools.json`
- Labs 页面：`source/tools/<slug>/index.md`
- Labs 模板：`themes/hexo-theme-matery/layout/tools/<slug>.ejs`
- 构建产物：`public/`

### Meowv Studio

```bash
cd studio
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
```

功能模块位于 `src/features/`，共享组件与组合式逻辑位于 `src/components/` 和 `src/composables/`，浏览器与本地隐私基础能力位于 `src/core/`。构建产物为 `dist/`。

### Zitie

```bash
cd zitie
npm run dev
npx tsc --noEmit
npm run build
npm run start
```

路由页位于 `app/*/page.tsx`，共享界面位于 `app/components/`，分页、Canvas 绘制、字体和导出逻辑位于 `app/lib/`。开发和构建命令会运行 `scripts/sync-hanzi-data.mjs`，生成所需的 `public/hanzi-data/`。

## 本地处理与生成内容

Studio 和 Zitie 均以浏览器本地处理为核心。用户选择的文件、图片和附件不得上传，也不得把其内容或敏感文件信息写入日志、统计信息、Cookie、URL 或远程数据库，不执行不受信任的主动内容。新增上传、远程转换、遥测、外部服务或权限前，必须先说明影响并取得授权。

下列内容由依赖安装、开发或构建过程生成，不应手工修改或提交：

- 通用：`node_modules/`、`.DS_Store`、根目录 `build/` 与临时构建目录
- Blog：`public/`、`db.json`
- Studio：`dist/`
- Zitie：`public/hanzi-data/`、`dist/`、`.vinext/`、`.next/`、`*.tsbuildinfo`

生产部署、Nginx 修改、域名切换、`yarn deploy` 和远程资源操作均不属于日常本地开发步骤，需要单独确认。仓库没有统一许可证，使用、分发或二次开发前应分别确认各项目的授权情况。具体协作与验证规则见 [AGENTS.md](./AGENTS.md)。
