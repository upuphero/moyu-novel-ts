# P0-08 公开配置兼容性审计

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 0 / P0-08

原则：**已贡献 key 不被静默删除；拼写修复有 alias；scope 有记录。**

## 1. 审计矩阵

| 配置 key | 贡献状态 | 实际消费 | 结论 | 处理 |
| --- | --- | --- | --- | --- | --- |
| `novelLook.readSetting.titleSize` | package.json 声明，default 1.6 | Reader 未消费（代码搜索无引用） | 保留 | 保留声明，description 标注"已贡献配置，当前 Reader 尚未消费"；Phase 8 Reader UI 时决定消费或正式弃用 |
| `novelLook.theme.custom[].fontWidght` | package.json 声明，default 400 | contextmenu.js 通用 CSS 变量输出 `--fontWidght`，style.css 无对应变量 → 空壳 | 拼写错误 | **新增 `fontWidth` 新 key**；`fontWidght` 保留为 deprecated alias（getThemeStyleRule 做 alias 归一）；description 标注废弃 |
| `novelLook.theme.custom[].fontFamily` | package.json 声明，default `"#FFF"` | contextmenu.js 输出 `--fontFamily`，style.css 使用 `var(--fontFamily)` | 默认值是错误占位 | 默认值改为 `""`（空串让 CSS 默认字体生效）；description 修正 |
| `novelLook.theme.custom[].textColor` | 声明，default #FFF | getThemeStyleRule 的 defaultKeys（textColor→color） | 保留 | description 修正（原为复制粘贴的错误文案） |
| 其他 theme 字段（bg/color/btnBg/btnColor/btnActive/btnActiveBorder/navBg） | 声明 | style.css 消费 | 保留 | description 修正复制粘贴文案 |
| `novelLook.readSetting.zoom` | scope machine，min 0.1 max 5 | WebView scroll.js clamp 0.4~10 | **schema 与实现边界不一致** | Phase 0 记录差异，不强行对齐（避免行为突变）；Phase 8 统一为单一边界；webView.ts 已按 0.1~10 收口校验 |

## 2. 保留/修复/弃用决策

- **保留**：所有已声明的 `readSetting.*`、`theme.*`、`match.*`、`ignore*` key。
- **修复**：`fontWidght` → 提供 `fontWidth`（alias 兼容）；`fontFamily` 默认值；
  全部 theme 字段的误导性 description。
- **弃用（窗口内）**：`fontWidght` 标记 deprecated，删除条件遵循 ADR-003 兼容窗口。

## 3. Scope 记录

| 配置 | scope | 说明 |
| --- | --- | --- |
| `readSetting.zoom` | machine | 缩放与设备相关 |
| `readSetting.scrollSpeed` | machine | 设备习惯 |
| `readSetting.screenDirection` | machine | 设备方向 |
| `theme.use` | machine | 当前主题选择 |
| `theme.custom` | application | 主题定义跨窗口共享 |
| 其余 readSetting | 默认（用户/工作区） | 阅读排版 |
| match/ignore | 默认 | 文件与章节规则 |

> 说明：scope 感知的读写 fallback（Global/Workspace/Workspace Folder）在 Phase 2 状态服务中实现，
> Phase 0 只记录不改造。

## 4. 验证

- [x] package.json schema 更新（fontWidth 新增、fontWidght deprecated、fontFamily 默认值、description）。
- [x] contextmenu.js 做 fontWidth→fontWidght alias 归一（旧主题仍生效）。
- [x] 配置读取单测覆盖 DEFAULT_CHAPTER_REGEX / DEFAULT_NOVEL_NAME_REGEX。
