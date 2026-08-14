# P0-02 回归护栏：clean install 与交互 Smoke Checklist

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 0 / P0-02

## 1. 自动化护栏（已入库）

| 项 | 位置 | 内容 |
| --- | --- | --- |
| 分章 characterization | `src/test/unit/splitCore.test.ts` | 头部/顺序/txtIndex/size、重复章名、无章节、中文数字章节、自定义正则、旧缺陷行为锁定（正文误判、主干去重误吞） |
| 编码识别 | `src/test/unit/encoding.test.ts` | UTF-8 / GBK / 带 BOM / 空 buffer |
| state shape | `src/test/unit/stateKeys.test.ts` | `book_<label>`、lastOpenChapter、isShowReadChapter、saveScroll 等 legacy 常量 |
| manifest 断言 | `src/test/unit/manifest.test.ts` | 菜单 view ID 拼写、命令声明一致性、身份、publisher 不冒用、示例命令已清理 |
| 激活冒烟 | `src/test/suite/extension.test.ts` | 命令注册（async activate）、示例命令已清理 |

运行：`npm run typecheck && npm run unit`（纯 Node，快）；集成测试 `npm test`（VS Code Extension Host）。

## 2. 手工/交互 Smoke Checklist（clean install 场景）

> 适用：全新用户数据目录（`--user-data-dir <tmp>`）+ 全新扩展安装。
> Phase 0 验收时逐项执行并记录结果。

### A. 全新安装可启动（P0-03-3）

- [ ] 全新 global storage 下 `扩展开发主机` 启动无报错
- [ ] 首次打开 Reader：`static/<version>` 资源被自动复制到 globalStorage，页面正常渲染
- [ ] 开发模式（F5）与生产模式（VSIX 安装）均通过

### B. 书库（P0-03-4 / P0-03-5）

- [ ] 书库根目录放 1 本 TXT：书架显示该书
- [ ] 仅嵌套目录（`书库/子目录/书.txt`）放书：根书架可展开子目录并看到书；
      关闭后重开（Alt+S）能恢复最近章节
- [ ] 修改 `novelLook.match.novelName` 后点刷新：立即生效（不再缓存旧配置）
- [ ] 设置非法正则（如 `[`）：提示错误并回退默认规则，书架不崩溃

### C. 阅读与交互（回归）

- [ ] UTF-8 / GBK 各 1 本：章节列表、正文正确
- [ ] 章节点击打开；上一章/下一章（按钮、侧键、方向键）正常
- [ ] 已读章节折叠/展开/清空正常
- [ ] 不同书存在同名章节：切换后能正确渲染（P0-03-7）
- [ ] Alt+S 打开 / Alt+D 关闭
- [ ] 双击自动滚屏；章末自动下一章
- [ ] Ctrl+滚轮缩放；主题切换
- [ ] 关闭窗口重开：滚动位置恢复（新旧 key 兼容）

### D. 平台（ADR-004 / P0-09）

- [ ] Windows/macOS/Linux：`打开书库目录` 正常（跨平台 openExternal）

## 3. 性能 smoke（P0-03-8 关联）

- [ ] 自动滚屏时 DevTools 确认 `scroll()` 内尺寸重算只在 renderId 变化时发生
      （`lastRenderId` 修复后每个 tick 不再重复取 scrollHeight/clientHeight）
