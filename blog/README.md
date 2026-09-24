# Blog

基于 Hexo 7 的个人博客，使用仓库内的 `hexo-theme-matery` 主题，线上地址为 [meowv.com](https://meowv.com)。协作边界与验证要求见 [`AGENTS.md`](./AGENTS.md)；仓库脚本与部署方式见[根目录 README](../README.md)。

## 快速开始

在 `blog/` 中使用 yarn（锁文件为 `yarn.lock`）：

```bash
cd blog
yarn install --frozen-lockfile
yarn server  # http://localhost:4000
yarn build   # 生成 public/
```

需要清除生成内容时运行 `yarn clean`。新建文章可运行 `yarn hexo new post "文章标题"`；其他页面与草稿模板见 `scaffolds/`。从仓库根目录也可用 `./run.sh blog` 和 `./build.sh blog`。

## 目录与配置

| 路径 | 用途 |
| --- | --- |
| `source/_posts/` | 文章及同名资源目录 |
| `source/_data/` | 站点共享数据 |
| `source/games/` | 独立静态游戏，由 Hexo 原样拷贝 |
| `themes/hexo-theme-matery/` | 主题模板、样式与资源；菜单等设置在其 `_config.yml` |
| `_config.yml` | 站点地址、永久链接、渲染与插件配置 |

站点配置使用 `/:title/` 作为文章永久链接，开启 `post_asset_folder`，并通过 `skip_render` 跳过 `games/**/*`。其他配置以 [`_config.yml`](./_config.yml) 和[主题配置](./themes/hexo-theme-matery/_config.yml) 为准。

## 构建与部署

`yarn build` 生成 `public/`；根目录的 `./build.sh blog` 会清理后重新生成，并汇总到 `build/meowv.com/`。实际发布使用根目录的 `deploy.sh`，流程见[根目录 README 的部署说明](../README.md#上传到-windows-nginx)。

站点配置仍含 `deploy: type: git`，但当前依赖没有 `hexo-deployer-git`，因此 `yarn deploy` 不是可用的发布路径。
