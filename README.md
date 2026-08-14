# Moyu Novel (moyu-novel-ts)

> 看(mo)书(yu)插件：纯本地、高性能的中文网络小说阅读扩展（VS Code）。
> 当前维护目标与分阶段路线见 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

***本插件更倾向于高性能和方便易用,沉浸阅(mo)读(yu)***
- 支持在 设置 中自定义主题(默认使用 vscode 主题,可以右键直接切换)
- 配合设置字体大小,字体,粗细+滚轮缩放,摸鱼|沉浸阅读两不误
  - 支持修改字体,但不建议,一个可读性高的字体对阅读体验和效率十分重要
- 目前仅支持本地 txt 文件(EPUB 小说模式在路线图中,见开发计划 Phase 4)
- 支持文件夹分组|已阅读章节分组
- 可以自定义分章正则(虽然我目前的已经很详细了)
- 自定义阅读页面可以修改小说目录/static 下的文件

## 功能介绍

- 左侧工具栏查看书
- Alt+s 显示
- Alt+d 隐藏
- 自动记录阅读进度(滚动高度 & 章节)
- 编码自动识别(GBK, UTF-8)
- 历史记录,隐藏已读章节

## 阅读页热键列表

|            热键            |         效果         |      备注      |
| :------------------------: | :------------------: | :------------: |
|          鼠标双击          | 自动滚屏+自动下一章  | 设置可调节速度 |
|       Ctrl+鼠标滚轮        |         缩放         |    同步设置    |
|      鼠标侧键前进后退      |         翻章         |       --       |
|        鼠标右键双击        |        下一章        |       --       |
|         数字键盘.          | 平滑向下滑动一段距离 |       --       |
|            空格            |    翻页 \| 下一章    |       --       |
|       上下左右,wasd        |       翻页翻章       |       --       |
| 支持全局快捷键 Alt+s,Alt+d |      显示,隐藏       |        -       |

## 设置项说明

- 滚屏速度,间隔时间
- 忽略文件夹
- 字体(标题)大小,缩放,缩进
- 如果您的书无法正确分章,可以修改正则

```js
// 默认正则,如果您有更好的方案欢迎反馈
/^(?:[ \t\r\f\v]*)(第[一二两三四五六七八九十百千万零〇\d]*[篇节部卷][ \t\r\f\v]*.*[ \t\r\f\v]*)?第[一二两三四五六七八九十百千万零〇\d]*章[^\n\r]*$/;
```

## 配置与命令命名空间（Phase 9 迁移说明）

- **配置项**：全部使用 `moyuNovel.*` 前缀（如 `moyuNovel.match.chapterName`、`moyuNovel.readSetting.zoom`）。
  旧前缀 `novelLook.*` 仍在**兼容窗口**内被只读回退读取（新 key 显式值 → 旧 key 显式值 → 默认值）；
  在设置中旧项标有"已迁移"提示，新设置请写入 `moyuNovel.*`。
- **命令 ID**：全部使用 `moyu-novel.*` 前缀（如 `Moyu Novel: 打开窗口` = `moyu-novel.openWebView`）。
  旧命令 `novel-look.*` 注册为 alias（同一实现），兼容窗口内外部调用与旧 keybinding 仍有效；
  但旧命令不再出现在命令面板（避免重复项）。
- **书架视图**：TreeView ID 迁移为 `moyuNovelTreeView`（Activity 容器 `moyu-novel`）。
- **兼容窗口**：alias 至少共存 2 个 minor 版本，删除条件见
  [P9-compat-window](./docs/phase9/P9-compat-window.md) 与 ADR-003。

## 平台支持

| 平台 | 支持 |
| --- | --- |
| Windows 10/11 | ✅ |
| macOS | ✅ |
| Linux | ✅ |
| Virtual Workspace | ✅（书库在用户目录，不依赖 workspace 文件） |
| Untrusted Workspace | ❌（不支持） |

详见 [ADR-004](./docs/adr/ADR-004-platform-support.md)。

## 开发

```bash
npm install          # 安装依赖（Node 20+，见 .nvmrc）
npm run watch        # esbuild 增量构建
npm run compile      # 构建 dist/extension.js
npm run typecheck    # TypeScript 类型检查
npm run unit         # 快速单元测试（纯 Node）
npm run lint         # ESLint
npm test             # VS Code 集成测试
npm run package      # 生产构建
npm run vsix         # 打包 .vsix（发布前须确认 Publisher，见 ADR-001）
npm run check        # lint + typecheck + unit + package
```

CI：`.github/workflows/ci.yml`（lint / typecheck / unit / production bundle / vsix smoke）。

## Credits

本项目 fork 自 [ytx222/novel-look-ts](https://github.com/ytx222/novel-look-ts)（原作者 yangtengxiang），
继续在 [MIT License](./LICENSE.txt) 下维护。上游版权声明保留于 LICENSE.txt。

## 已知限制

- 读者 UI：正文行宽/行高/段距优化、按钮 hover、窄窗口自适应；WebView 全部 TS 化 + CSP/nonce 加固。
- 阅读进度条：Reader 底部实时显示当前章、本章/全书百分比；主题兼容不挡正文。
- 章节识别升级：默认多类别 matcher（第X章/卷部篇集节、序尾后记翻外、英文 Chapter），正文句子不再误判为章节；自定义规则优先。
- 全书搜索：`Moyu Novel: 全书搜索` 命令或书架标题栏按钮，TXT/EPUB 可搜索并点击定位高亮。
- 支持本地 TXT 与 reflowable、无 DRM、以文字为主的 EPUB 2/3（不支持 ZIP64、图片不渲染、不套用出版社 CSS，见 ADR-010）。
- 文件移动/重命名后阅读进度不自动关联（bookId 基于路径哈希，见 ADR-007）；重新打开章节即可重建。
- 扩展 ID 相关迁移说明见 [ADR-002](./docs/adr/ADR-002-extension-id-migration.md)。
- 阅读统计、完整主题编辑器、字体推荐等在 backlog（见开发计划 §12）。

## 已知限制

- **文件移动后进度不关联**（P2，ADR-007）：bookId 基于路径哈希，移动/重命名书文件后旧进度不再自动关联，重新打开章节即可重建。
- **旧命令/配置兼容窗口**（P9，ADR-003）：`novel-look.*` 命令 alias 与 `novelLook.*` 配置读取支持将在窗口到期后移除；当前版本继续保留。
- **扩展 ID 迁移**（P2，ADR-002）：新扩展身份 `moyu-novel.moyu-novel-ts` 无法自动读取旧 `ytx222.novel-look-ts` 的书库与状态，迁移方案见 [ADR-002](./docs/adr/ADR-002-extension-id-migration.md) 与 [P0-04 spike 报告](./docs/phase0/P0-04-extension-id-spike.md)。
- **EPUB 子集**（P4，ADR-010）：不支持 ZIP64、完整 XML 特性、图片渲染与出版社 CSS；损坏章节跳过不影响其他章节。
