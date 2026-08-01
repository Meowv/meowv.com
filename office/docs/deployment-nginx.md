# Nginx 部署

生产构建：

```bash
cd office
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

将 `dist/client/` 部署到 `C:/_qix/office.meowv.com`。证书路径：

```text
C:/_qix/nginx/ssl/office.meowv.com_bundle.crt
C:/_qix/nginx/ssl/office.meowv.com.key
```

仓库根 `nginx.conf` 提供静态站点、WASM MIME、长期缓存、安全头和旧域名 301 示例。它不代表生产
服务器当前状态；上线前必须检查真实证书、目录、gzip 行为和 Nginx 版本。

旧域名必须同时保留 HTTP 与 HTTPS 虚拟主机，并使用：

```nginx
return 301 https://office.meowv.com$request_uri;
```

旧 HTTPS 证书不能立即删除，因为浏览器先完成 TLS 握手，之后才能收到 301。
