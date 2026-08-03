# 部署说明

## 部署模型

项目使用 Nuxt 静态生成模式。生产服务器只需要分发 `.output/public/`，不需要 Node.js 常驻进程、数据库、PHP、文件上传接口或应用服务器代理。

示例域名：

```text
https://pdf.meowv.com
```

## 构建环境

- Node.js 24
- pnpm 11.9.0
- Linux、macOS 或可运行 Node.js 的 CI 环境

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

成功构建后应确认以下文件或目录存在：

```text
.output/public/index.html
.output/public/_nuxt/
.output/public/robots.txt
.output/public/sitemap.xml
```

上述命令必须以实际退出码为准；本文不构成测试或构建已通过的声明。

## Nginx

仓库提供 [deploy/nginx.conf](../deploy/nginx.conf)。部署前至少需要替换：

- `root /var/www/pdf.meowv.com/current;`
- TLS 证书与私钥路径；
- 如发行版路径不同，调整日志或证书位置。

示例目录采用版本化发布：

```text
/var/www/pdf.meowv.com/
  releases/
    20260728-120000/
  current -> releases/20260728-120000
```

将 `.output/public/` 的内容上传到一个新的 release 目录，检查文件完整后再原子切换 `current` 软链接。保留上一个 release 可以快速回滚；删除旧版本前应再次确认目标路径。

启用配置前执行：

```bash
nginx -t
```

只有配置检查成功后才由有权限的运维人员重载 Nginx。申请证书、修改 DNS、切换软链接和重载生产服务都会产生外部影响，应在明确的发布窗口内执行。

## HTTPS 与证书

HTTP server 只做 `301` 跳转。HTTPS server 的证书路径使用 Let's Encrypt 常见占位值：

```text
/etc/letsencrypt/live/pdf.meowv.com/fullchain.pem
/etc/letsencrypt/live/pdf.meowv.com/privkey.pem
```

仓库不保存私钥、令牌、服务器地址或部署密码。证书申请与自动续期由部署环境管理。

## 静态路由与 404

Nuxt 为公开路由生成目录或 HTML。Nginx 依次尝试：

```text
$uri
$uri/
$uri/index.html
```

找不到时返回真正的 `404`，而不是把所有未知路径重写到首页。这样可以避免搜索引擎把不存在的工具页当作有效页面。

## 缓存策略

| 资源                        | 建议                           |
| --------------------------- | ------------------------------ |
| `/_nuxt/*` 指纹资源         | 一年缓存，`immutable`          |
| 图片、字体、WASM            | 一年缓存，`immutable`          |
| HTML 和路由文档             | `no-cache`，每次使用前重新验证 |
| `robots.txt`、`sitemap.xml` | 一小时短缓存                   |

发布时不能用旧文件覆盖新指纹资源后继续复用同一文件名。HTML 使用短缓存可以及时引用新的构建哈希。

## 安全响应头

示例配置包括：

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Content-Security-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY`

CSP 默认只允许本站脚本和资源，并额外开放 Google Analytics 所需的 `www.googletagmanager.com` 脚本及 Google Analytics 统计请求。Nuxt 静态产物会生成 `importmap` 与客户端启动数据两段内联脚本，且启动数据包含每次构建都会变化的构建 ID，因此 `script-src` 必须保留 `'unsafe-inline'`；不能使用固定哈希替代。其余来源仍限制为本站、Google Analytics、Blob Worker、Blob/Canvas 图片与 WebAssembly 编译，并禁止对象嵌入和其他第三方脚本。PDF.js 配置了 `isEvalSupported: false`，因此不需要开放通用的 `'unsafe-eval'`。

修改 CSP 后需要在 Chrome、Firefox 和 Safari 实机检查 PDF Worker、缩略图、图片导出、ZIP 下载与捐赠二维码，不能只确认首页能打开。

## Gzip 与 Brotli

示例默认启用 Gzip。若服务器已经安装 Brotli 模块，可在 HTTPS server 中启用：

```nginx
brotli on;
brotli_comp_level 5;
brotli_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml application/wasm;
```

未安装模块时不要直接加入这些指令，否则 Nginx 配置检查会失败。

## GitHub Actions

`.github/workflows/ci.yml` 使用 Node.js 24 和 pnpm 11，依次执行：

1. 安装锁定依赖；
2. 类型检查；
3. Lint；
4. 单元测试；
5. 静态构建；
6. 上传 `.output/public/` 为 `pdf-meowv-static` Artifact。

工作流不直接部署生产环境。若后续增加部署 Job，服务器地址、目标路径、SSH 私钥和令牌必须保存在 GitHub Environments/Secrets 中，并使用 `YOUR_SERVER`、`YOUR_DEPLOY_PATH` 等明显占位符记录示例，不能提交真实敏感信息。

## 发布后检查

- 首页和 11 个工具页返回 `200`；
- `/privacy`、`/help` 与 `/donate` 可访问；
- 不存在的路径返回 `404`；
- `robots.txt` 与 `sitemap.xml` 内容正确；
- `_nuxt` 资源具有长期缓存，HTML 没有过长缓存；
- PDF.js Worker、图片转换和 ZIP 下载未被 CSP 阻止；
- Network 面板中没有 PDF 或图片文件上传请求；
- 页面刷新后不恢复工作区文件；
- 桌面和移动端均可完成至少一个处理与下载流程；
- TLS 证书链和自动续期正常。

## 回滚

若发布后发现问题，将 `current` 重新指向上一个经过验证的 release，并再次执行 `nginx -t` 后重载。不要覆盖或删除当前故障版本，保留它用于排查；确认恢复完成后再决定清理策略。
