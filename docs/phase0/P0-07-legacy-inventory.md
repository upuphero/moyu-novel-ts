# P0-07 Legacy Inventory：旧身份与稳定 ID 清单

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 0 / P0-07

集中登记 `command / config / view / state / storage` 的旧身份与迁移目标。
**唯一的字符串来源**：`src/legacy/ids.ts`（代码）与本文档（清单）。
禁止在业务代码中散落硬编码字符串、禁止机械全局替换 namespace。

## 1. Command（命令 ID）

| 命令 | 旧值（当前） | 长期目标 | 状态 |
| --- | --- | --- | --- |
| 刷新书架 | `novel-look.refreshFile` | `moyu-novel.refreshFile` | Phase 9 |
| 刷新 static（开发） | `novel-look.refreshStaticFile` | `moyu-novel.refreshStaticFile` | Phase 9 |
| 打开书库目录 | `novel-look.openExplorer` | `moyu-novel.openExplorer` | Phase 9 |
| 打开 static 目录 | `novel-look.openWebViewDir` | `moyu-novel.openWebViewDir` | Phase 9 |
| 打开章节 | `novel-look.showChapter` | `moyu-novel.showChapter` | Phase 9 |
| 关闭阅读窗口 | `novel-look.closeWebView`（Alt+D） | `moyu-novel.closeWebView` | Phase 9 |
| 打开阅读窗口 | `novel-look.openWebView`（Alt+S） | `moyu-novel.openWebView` | Phase 9 |
| 显示已读章节 | `novel-look.showReadChapter` | `moyu-novel.showReadChapter` | Phase 9 |
| 折叠已读章节 | `novel-look.hideReadChapter` | `moyu-novel.hideReadChapter` | Phase 9 |
| 清空已读章节 | `novel-look.clearReadChapter` | `moyu-novel.clearReadChapter` | Phase 9 |
| 上一章/下一章（内部） | `novel-look.prevChapter` / `novel-look.nextChapter` | 同左迁移 | Phase 9 |

已删除（P0-11）：`novel-look.helloWorld`、`novel-look.test`、`extension.sayHello`、
`novel-look.sayHello`。

## 2. Configuration（配置项，前缀 `novelLook.`）

| 配置 | scope | 状态 |
| --- | --- | --- |
| `novelLook.match.novelName` | 用户/工作区 | 保留；非法正则回退默认（P0-03-5） |
| `novelLook.match.chapterName` | 用户/工作区 | 保留；非法正则回退默认（P0-03-5） |
| `novelLook.ignoreDir` / `ignoreFileName` | 用户/工作区 | 保留；动态读取（P0-03-5） |
| `novelLook.showRefreshStaticFile` | 用户/工作区 | 保留（开发用） |
| `novelLook.readSetting.*`（lineIndent/rootFontSize/titleSize/zoom/scrollSpeed/scrollEndTime/scrollStartTime/titleCenter/screenDirection） | 见 schema | 保留；titleSize 为已贡献但 Reader 未消费 key（P0-08） |
| `novelLook.theme.use` / `theme.custom` | machine / application | 保留；custom 中 `fontWidght` 拼写 alias（P0-08） |

## 3. View / Container

| 项 | 旧值（当前） | 长期目标 | 状态 |
| --- | --- | --- | --- |
| Activity 容器 | `novel-look` | `moyu-novel` | Phase 9 |
| TreeView | `novelLookTreeView` | `moyuNovelTreeView` | Phase 9 |
| WebView panel type | `novel` | 内部值，可随 Phase 9 调整 | 记录 |

> 修正记录：`view/item/context` 菜单的 when 曾拼写为 `novelLookTreeViewk`（P0-03-6），
> 已修正为 `novelLookTreeView`，manifest 单测锁定。

## 4. State（globalState key）

| key | 内容 | 状态 |
| --- | --- | --- |
| `book_<label>` | 已读章节数组（number[]） | 保留；Phase 2 迁移到 schema 化状态 |
| `lastOpenChapter` | `{title, i, bookName, fullPath}` | 保留；Phase 2 迁移 |
| `isShowReadChapter` | boolean | 保留；未版本化 |
| `saveScroll` | `{key, value}`（pixel） | 保留；Phase 2 改为语义进度 |

## 5. Storage（文件系统）

| 位置 | 内容 | 状态 |
| --- | --- | --- |
| `globalStorageUri/` | 用户书库（小说文件） | 迁移方案见 ADR-002 |
| `globalStorageUri/static/<version>` | Reader 静态资源（dev 为 `<version>.dev`） | 由扩展自动复制（P0-03-3） |

## 6. 迁移测试矩阵（Phase 9 验收时执行）

| 场景 | 期望 |
| --- | --- |
| 旧命令 ID 调用 | alias 生效，行为一致 |
| 旧 keybinding（Alt+S/Alt+D） | 仍可用 |
| 旧配置 `novelLook.*` 显式值 | 新 key 无值时回退读取旧值 |
| 旧状态 key | 迁移幂等，旧值保留一个兼容窗口 |
| 新安装 | 只写新 key，不产生 legacy 残留 |
