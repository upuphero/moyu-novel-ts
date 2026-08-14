# P0-10 最低 WebView 安全边界

> 状态：完成（Phase 0 最低边界）· 2026-08-13
> 对应开发计划：Phase 0 / P0-10；完整加固在 Phase 8（P8-05）

## 已实施（Phase 0）

1. **禁止远程资源：** `static/webView.html` 启用 CSP
   `default-src 'none'; script-src #csp; style-src #csp 'unsafe-inline'; img-src #csp data:; font-src #csp`
   （`#csp` 在扩展侧替换为 `webview.cspSource`）。无任何 `http(s)` 源，远程脚本/样式/连接全部被拒。
2. **消息 key 白名单：** Extension Host 端 `fn.updateReadSetting` 只接受
   `config.ALLOWED_READ_SETTING_KEYS` 内的 key（`readSetting.zoom` / `scrollSpeed` /
   `screenDirection`）；其余 key 拒绝并告警。**任意消息不能更新未允许的配置。**
3. **数值边界校验：** `fn.zoom`（0.1~10）、`fn.changeUseTheme`（非负整数）、
   `fn.saveScroll`（形状 + 有限数字）在 Extension Host 侧校验。
4. **文本安全渲染：** Reader 正文使用 `innerText`（webView.js render），无不可信 `innerHTML`；
   主题列表改为 DOM API + `textContent` 构建（contextmenu.js renderThemeContent，原为
   `innerHTML` 拼接 `theme.name`，存在注入风险）。

## 风险登记（Phase 8 处理，P8-05）

| 项 | 现状 | 处理阶段 |
| --- | --- | --- |
| `postMsg` 使用 `Promise.race(..., sleep(5))` | 消息无 request/response ID，错误不可诊断 | Phase 8（P8-04） |
| CSP `'unsafe-inline'` 用于 style | 动态样式注入需要；后续可收紧为 nonce | Phase 8 |
| 消息协议整体 runtime validation | `fn` 分发 + 局部校验，未做统一 schema | Phase 8（P8-05） |
| `saveScroll` 仍为 pixel | 语义进度在 Phase 2 | Phase 2 |
| enableFindWidget / localResourceRoots | 保持现状，Phase 8 复核 | Phase 8 |
