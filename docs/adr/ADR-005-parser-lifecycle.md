# ADR-005：BookParser.load() 生命周期、错误与资源释放语义

> 状态：接受（Phase 1 关闭）· 2026-08-13
> 关联：DEVELOPMENT_PLAN.md §9 / Phase 1（P1-02）

## 背景

统一 Parser 需要明确的加载、错误与资源释放语义，供 TxtParser（Phase 1）与
EpubParser（Phase 4）共同实现。

## 决策

1. **生命周期：**
   - `load(): Promise<BookMetadata>` 幂等：重复调用不重复读取文件，返回缓存的 metadata。
   - **懒加载**：`getChapterList()` / `getChapterContent()` 内部先 `load()`，调用方无需
     显式初始化。
   - `dispose()` 释放全文与索引缓存；**dispose 之后仍可重新 `load()`**（重新读取文件），
     parser 对象可复用。
2. **缓存与资源：**
   - TXT 全文缓存 TTL 10 分钟（与旧 `Book.getContent()` 行为一致），任何访问都会续期。
   - 缓存文本只存在于 parser 内部，**绝不写回小说文件或小说所在目录**。
3. **错误语义：**
   - 文件读取失败 / 解码失败：抛出 `Error`，由 UI 层（Book adapter）捕获并提示，
     书架不崩溃、Reader 不崩溃。
   - 章节不存在（`getChapterContent` 的 index 越界）：抛出明确 `Error`（含路径与 index）。
   - 不支持的格式：`ParserFactory` 抛 `UnsupportedFormatError`（带可读 message），
     由 Book 构造捕获并记录 `parserError`，树中该书籍可展示但不可展开。
4. **测试约定：** parser 核心为纯 Node（不 import vscode），文件读取与章节正则均由
   构造注入，单测可脱离 Extension Host；VS Code 适配（`vscodeFileReader`）单列于
   `src/file/vscodeAdapter.ts`。

## 后果

- 正面：parser 可独立单测；错误路径集中处理；EPUB parser 复用同一契约。
- 负面/风险：缓存 TTL 语义与旧实现一致（Phase 3 引入章节索引缓存后重新评审）。

## 验收

- [x] `TxtParser` 懒加载 / dispose 后重载 / 章节越界错误 / 注入正则 均有单测。
- [x] Book 对不支持格式不崩溃（集成测试覆盖）。
