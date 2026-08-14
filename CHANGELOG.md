# 版本更新日志

## [Unreleased]

### Phase 9（内部 namespace 收口与发布准备，P4）

- **命令收口（P9-01）**：全部命令迁移 `moyu-novel.*`（`Command` 常量）；keybinding（alt+s/alt+d）、菜单、activationEvents、when clause 同步新 ID；TreeView/容器迁移 `moyuNovelTreeView` / `moyu-novel`。
- **旧命令 alias（P9-02）**：`novel-look.*` 注册到同一 handler（不进命令面板）；外部调用与旧 keybinding 兼容窗口内有效。
- **设置/状态迁移（P9-03）**：配置读写 `moyuNovel.*`；旧 `novelLook.*` 只读 fallback（新 key → 旧 key → 默认）；`novelLook.*` 设置项标注"已迁移"；状态迁移沿用 P2-05（migration v1 幂等）。
- **发布准备（P9-04/05）**：README/CHANGELOG/已知限制更新；发布 checklist 与兼容窗口文档（`docs/phase9/`）；ADR-003 关闭。
- 单测 244 → 254；manifest/stateKeys/extension 测试重写为新 ID + legacy 锁定。
### Phase 8（Reader UI 与 WebView TypeScript，P4）

- **WebView TS（P8-01/02）**：6 个 static/js 业务模块全部迁移为 `src/webview/*.ts`；esbuild 同时产出 Extension Host 与 WebView bundle（`static/js/webview.bundle.js`）；`static/js` 只保留构建产物。
- **共享消息 contract（P8-01/05）**：`src/shared/contract.ts` 为双向消息单一事实来源；两侧均做 runtime validation，非法 payload 拒绝并告警。
- **消息协议修复（P8-04）**：移除 `Promise.race(..., sleep(5))` 临时绕过，postMsg 改单向发送、错误可诊断。
- **安全加固（P8-05）**：nonce + CSP（无远程源）；主题 CSS 值 sanitize（防 `;{}`/expression/url()/javascript: 注入）；文本渲染沿用 textContent。
- **布局改善（P8-03）**：正文最大宽度 46em、行高 1.8、段距 1.2em、标题间距；按钮 hover；窄窗口 responsive。
- 单测 225 → 244；双 tsc（extension + webview）纳入 typecheck。
### Phase 6（阅读进度条，P3）

- **进度计算（P6-01）**：`computeProgress` 纯函数，`(chapterIndex + chapterProgress) / totalChapters`；头部计入总数（ADR-006）；空书不除零；钳制与非法输入安全。
- **轻量 UI（P6-02）**：Reader 底部 3px 进度细条 + 右下角文字（`第 x / y 章 · 本章 % · 全书 %`）；`pointer-events:none` 不遮挡正文；切章/滚动实时更新。
- **控制滚动成本（P6-03）**：rAF 合并（每帧最多一次 DOM 写）+ 段落定位复用二分；自动滚屏/滚动无卡顿。
- P6-04 可选跳转：非首版门槛，记录 backlog。

### Phase 7（中文章节识别升级，P4）

- **matcher pipeline（P7-01/02）**：5 个可单独测试的 matcher（第X章 / 卷部篇集 / 节 / 序尾后记番外 / 英文 Chapter）替代单巨型正则；17 种标题正例全识别，10 种正文/对话反例不识别；**修复 P0 已知缺陷**（`第二章的内容。` 不再误判为章节）。
- **保留自定义规则（P7-03 / ADR-012）**：用户显式规则完全替换内置；无效 regex 提示并安全回退；每次调用重读配置。
- **缓存联动（P7-04）**：`CHAPTER_MATCHER_VERSION` + `ruleKey`（内置 `matcher:vN` / 用户 `user:<source>`）→ ruleHash 变化自动失效；`TXT_PARSER_VERSION` 1→2，旧缓存被 cleanup 清理。
- 性能：30 MB 合成数据 matcher 扫描 **107ms**（489137 行 / 9484 章，无灾难性回溯）。
- 单测 170 → 225；新增 ADR-012。
### Phase 5（全书搜索，P3）

- **搜索 contract（P5-01 / ADR-011）**：SearchQuery/SearchResult（chapterId/index/title、paragraphIndex、preview、matchStart/Length）；BookSearch 契约。
- **TXT/EPUB 共用实现（P5-02/03）**：逐章线性扫描；EPUB 首次搜索构建章节正文索引，**第二次搜索不重新解析任何 XHTML**（readFile 计数断言）。
- **命令与 UI（P5-04）**：`moyu-novel.searchBook`（书架标题栏按钮 + 命令面板）；选书 → 输入关键词（Enter 提交才扫描）→ 可取消进度 → 结果列表 → 点击打开章节并定位高亮；高亮用 textContent 安全重建（P0-10），不解析用户输入为 HTML。
- **缓存与边界（P5-05）**：章节列表比对失效（文件/规则变化自动重建）；每章/每行检查取消句柄；结果上限默认 200（可配 1..500），大书搜索不阻塞无限增长。
- 单测 156 → 170；新增 ADR-011；无新增依赖。
### Phase 4（EPUB 小说模式，P2）

- **依赖与安全评审（P4-01 / ADR-010）**：零新增依赖——自实现最小 ZIP 读取器（node:zlib 解压）+ 最小 XML 解析器，攻击面完全可控。
- **容器与包信息（P4-02）**：container.xml → OPF（metadata/manifest/spine）；EPUB2 NCX 与 EPUB3 nav 标题；缺失可选 metadata 有回退。
- **懒加载章节表（P4-03）**：书架只读 container/OPF/nav，不解析任何章节 XHTML（spy 证明）；正文按需读取。
- **正文提取（P4-04）**：h1–h6 → heading、p/div/br/li → 段落块；script/style/nav 跳过（不执行脚本、不套用出版社 CSS）；img 取 alt。
- **接入书架与 Reader（P4-05）**：`.epub/.EPUB` 经 ParserFactory 创建 EpubParser；ChapterContent 与 TXT 同构，TXT/EPUB 共用同一 Reader 消息模型。
- **防御恶意输入（P4-06）**：ZIP 路径穿越/条目数/解压大小/压缩比/CRC 校验，ZIP64 明确报错；XML 简单 DOCTYPE 允许、内部子集/外部引用拒绝（XXE）；损坏章节错误隔离，书架不崩溃。
- 单测 110 → 156；新增 ADR-010；无新增依赖。
### Phase 3（TXT 章节索引缓存，P1）

- **缓存 schema（P3-01 / ADR-009）**：TxtChapterIndex（版本化 + 校验条件 + 章节数组），JSON 落盘，损坏/写入中断安全重建；原子写（temp + rename）。
- **缓存校验（P3-02）**：size / mtime / 规则 hash / parser version / filePath 任一变化即重建；文件名带版本，升级即失效。
- **接入 TxtParser（P3-03）**：命中缓存 0 读全文、0 split；stat 失败降级旧路径；正文懒加载 + 文件变化自动重新索引；按 bookId 隔离在 global storage（不碰小说文件/目录）。
- **可观测性（P3-04）**：split/stat 注入计数；固定 seed 合成生成器（1/10/30 MB，30MB 约 160ms）；命中场景 0 次 split 断言。
- **生命周期（P3-05）**：启动清理一次——版本不匹配/孤儿/超容量 LRU（默认 50MB）；不每次启动清空全部；非缓存文件跳过。
- 单测 86 → 110；新增 ADR-009；无新增依赖。
### Phase 2（Book ID、状态与语义阅读进度，P1）

- **稳定 ID（P2-01 / ADR-007）**：bookId = 路径哈希（算法版本化），chapterId = bookId#index；同名不同路径状态隔离；文件移动后进度不自动关联（文档明示）。
- **带 schema 状态服务（P2-02）**：StateStore（vscode/内存双实现）、新 key 集中定义、shape 校验、读取 fallback（新 key → 旧 key → 默认，只读不回写）。
- **语义进度（P2-03 / ADR-008）**：ReadingProgress（chapterId + paragraphIndex 为主锚点，chapterProgress 为 fallback）；新进度不再依赖 pixel。
- **定位与恢复（P2-04）**：WebView 段落 identity 定位（二分）、恢复链 段落 → 本章进度 → 旧 pixel（仅首次）→ 开头；滚动防抖上报 + 切章前 flush；布局变化后定位误差不超过一个段落。
- **旧状态迁移（P2-05）**：isShowReadChapter / lastOpenChapter / book_* 幂等迁移到新 schema（marker 防重）；旧 pixel 首次恢复即转写新进度；旧值保留兼容窗口；**含本地路径的状态不再跨设备同步**（移除 setSync）。
- 单测 52 → 86；新增 ADR-007/008；无新增依赖。
### Phase 1（统一 Parser 与 TXT 适配，P0）

Phase 1 完成。用户可见行为不变。

- **统一模型（P1-01）**：新增 `src/core/book/model.ts`（`BookMetadata` / `ChapterInfo` / `ChapterBlock` / `ChapterContent`），Reader 与书架只消费统一类型，不感知 TXT/EPUB 差异。
- **Parser 生命周期（P1-02 / ADR-005）**：`BookParser` 接口 + `ParserFactory`；`.txt` 大小写安全识别，`.epub` 与未知格式返回明确错误（书架不崩溃）。
- **TxtParser（P1-03）**：读取、编码识别、分章、按章取内容全部收敛到 parser；纯 Node 可测（文件读取/章节正则注入）。
- **Book/Chapter 适配（P1-04）**：`Book` 不再直接管理 txt/split/substring；章节正文经统一模型获取。
- **TXT 回归锁定（P1-05）**：与旧实现逐项等价对比测试（5 个 fixture × 章节）；单测总数 52 个。
- **头部/preface 语义（ADR-006）**：头部计入章节总数；无章节/空文件行为明确。
- 新增 ADR-005/006，更新 CHANGELOG/开发计划；无新增依赖。

## [2.1.11] - 2026-08-13

Phase 0（身份与工程基线）完成。主要变更：

- **身份迁移（P0-06 / ADR-001/002）**
  - 包名 `novel-look-ts` → `moyu-novel-ts`，displayName → `Moyu Novel`。
  - `publisher` 不再使用上游 `ytx222`（暂为占位 `moyu-novel`，发布前须确认，见 ADR-001）。
  - repository / homepage / bugs 统一指向 `upuphero/moyu-novel-ts`。
  - 扩展 ID 变更影响（旧书库/状态可达性）与迁移方案见 ADR-002。
- **既有缺陷修复（P0-03）**
  - `activate()` 改为等待异步 `init()` 完成。
  - dev mode 判断改用 `extensionMode`（原读取不存在的 `isUnderDevelopment`）。
  - 静态资源复制先创建目标目录，写入错误不再被吞。
  - 嵌套目录书库：根 `bookMap` 递归建索引，最近章节可恢复。
  - 文件筛选配置改为每次刷新读取；非法正则提示并回退默认。
  - context menu 的 view ID 拼写错误 `novelLookTreeViewk` 修正。
  - WebView 去重与滚动 key 加入书身份，同名章节不再互相干扰。
  - 自动滚屏 `lastRenderId` 补更新，滚动 tick 不再重复计算尺寸。
- **回归护栏（P0-02）**：新增 30 个单元测试（分章 characterization、编码识别、state shape、manifest 断言）；新增 fixtures（UTF-8/GBK/BOM）。
- **工程基线（P0-01/P0-12）**：lockfile 重新生成（版本同步、镜像 URL 清理）；`.nvmrc` 更新为 Node 20.19.4；新增 `unit/typecheck/vsix/check` 脚本与 CI workflow。
- **安全边界（P0-10）**：启用 WebView CSP；`updateReadSetting` key 白名单；主题列表改为安全 DOM 渲染。
- **配置审计（P0-08）**：`fontWidght` 提供 `fontWidth` alias；`fontFamily` 默认值修复；description 修正。
- **平台（P0-09/ADR-004）**：打开目录改用跨平台 `vscode.env.openExternal`。
- **脚手架清理（P0-11）**：删除示例命令（helloWorld/test/sayHello）、webpack 遗留（配置与依赖）、Quickstart 文档、无用调试代码。
- **文档**：新增 ADR-001~004、legacy inventory、配置审计、安全边界、smoke checklist、P0-01 基线报告。

## [0.0.1]

- 迁移计划开始

## [2.0.1]

- 正式上线吧

## [2.0.2]

- 紧急修复几个bug,防止影响到作者使用[滑稽]
  - novel-look 虽然在关闭后重新显示可以恢复进度,但是隐藏后重新显示不会恢复进度
    - 由这个问题衍生出
    - 在上方显示后,移动到下方,之后会报一下错,然后下一页无效,不过在隐藏后重新显示后恢复
  - novel-look 缩放功能有bug
- 不过以上问题都以修复

## [2.0.3]

发现postMessage发送消息返回的Promise一直处于pending,导致无法正常显示页面,暂时通过限制最大延迟5ms解决
后续可以考虑使用message id,并回传消息id以提前结束?
阅读初始化时体验优化
