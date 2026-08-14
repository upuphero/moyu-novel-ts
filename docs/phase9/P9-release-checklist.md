# Phase 9 发布 checklist（P9-04）

> 用途：向 VS Code Marketplace 发布前逐项确认。
> 未全部通过前**禁止** `vsce publish`。

## 0. 发布前必须确认（ADR-001）

- [ ] 已确认实际拥有的 Marketplace Publisher ID（当前为占位 `moyu-novel`，**不得**以占位 ID 发布）。
- [ ] 若实际 Publisher ID 与 `moyu-novel` 不同：按 ADR-002 的迁移路径再走一次身份变更验证
      （globalStorageUri / globalState 命名空间变化 → 书库可达性确认）。
- [ ] 更新 ADR-001 并关闭"待办"标记。

## 1. 构建与测试

- [ ] `npm install` 干净安装（无 peer 冲突、无镜像 URL 残留）。
- [ ] `npm run check` 通过：lint 0 错误 + 双 tsc typecheck + 全部单测 + production bundle。
- [ ] 集成测试（CI 或本地可下载 VS Code 归档时）：`npm test` 通过
      （含命令注册、manifest 断言、bookId、迁移、搜索、EPUB、WebView bundle 断言）。
- [ ] `npx vsce ls` 检查打包内容：无 `src/**`、无 `docs/**`、无 `out/**`、
      含 `dist/extension.js`、`static/**`（含 `static/js/webview.bundle.js`）、`LICENSE.txt`、
      `README.md`、`CHANGELOG.md`、`img/**`。
- [ ] 在干净环境安装 VSIX：`code --install-extension <vsix>` 无报错。

## 2. 手工 smoke（VS Code 开发主机）

- [ ] 书库：放入 TXT（UTF-8/GBK）、EPUB 各一本 → 书架显示、展开章节正常。
- [ ] 阅读：打开章节、切章、已读分组、最近章节恢复、进度条。
- [ ] 热键矩阵：Alt+s / Alt+d、Space、W/A/S/D、方向键、鼠标侧键、Ctrl+滚轮、双击自动滚屏、
      章末自动下一章。
- [ ] 全文搜索：命令 → 选书 → 关键词 → 结果 → 点击跳转高亮。
- [ ] 主题：右键切换、自定义主题 CSS 安全（注入样例被过滤）。
- [ ] 禅模式、屏幕方向、缩放、滚动速度设置。
- [ ] **命名空间迁移验证（P9）**：
  - 设置面板：`moyuNovel.*` 可读写；`novelLook.*` 带"已迁移"提示。
  - 命令面板：`Moyu Novel: ...` 出现，`novel-look.` 旧命令不出现。
  - 旧 keybinding（用户 settings.json 中 `novel-look.openWebView`）仍有效。
  - 书架视图在新 Activity 容器（moyu-novel）下正常显示。
- [ ] 旧版升级路径（如有旧版本 VSIX）：安装旧版 → 配置旧 key → 升级新版 → 旧配置被 fallback 读取。

## 3. 身份与合规（P9-04）

- [ ] `package.json`：name/displayName/publisher/repository/homepage/bugs 正确；publisher 非上游。
- [ ] `LICENSE.txt` 保留上游 MIT 与 `Copyright (c) 2020 yangtengxiang`，未删改。
- [ ] README fork attribution 保留；仓库 URL 指向 `upuphero/moyu-novel-ts`。
- [ ] 不提交：真实小说、用户路径、globalStorage、个人数据、大文件（>10MB 合成数据不入库）。

## 4. 发布动作

- [ ] 版本号 bump（semver；身份迁移完成后由维护者决定）。
- [ ] `npx vsce package` → 生成 VSIX。
- [ ] CHANGELOG 已记录本版本变更（含用户可见行为：命名空间迁移）。
- [ ] 发布到 Marketplace（确认 Publisher 后）或走私有分发。

## 5. 发布后

- [ ] 在干净机器安装正式版做最终 smoke。
- [ ] 记录发布时间、版本、Publisher ID；更新 ADR-001/ADR-002 状态。
