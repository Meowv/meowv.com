# 上游同步

## 基线

- 仓库：`https://github.com/ranuts/document.git`
- 固定提交：`fcaa66eb92d1759c1ec695f668e7adf2e4c8150b`
- 提交日期：2026-07-25
- 引入日期：2026-08-01
- 许可证：GNU AGPL-3.0

不追踪上游 `main`。升级前先在临时目录检出目标提交，审计依赖、许可证、字体、遥测、AI 与文件网络
边界，再对比 `docs/upstream-patches.md` 中的补丁。

## 升级步骤

1. 记录候选提交 SHA 和变更范围。
2. 检查 `package.json`、锁文件和新增工作区包，拒绝云模型、API Key、用户系统和上传服务。
3. 检查 `public/sdkjs/`、`public/web-apps/`、`public/wasm/` 的许可证与体积变化。
4. 逐项重放 Meowv 补丁，不直接覆盖首页、隐私、PWA、构建和部署配置。
5. 运行类型、Lint、单元、四格式保存回归、E2E 和构建检查。
6. 在 Chrome、Firefox、Safari 检查打开、保存、未保存退出、中文字体和移动端入口。

任何核心格式保存或重新打开失败都不得升级生产版本。
