# P0-04 外部扩展身份迁移 Spike 报告

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 0 / P0-04；结论进入 ADR-002

## 1. 目标

实测"扩展 ID 改名"对 `globalState` / `globalStorageUri`（书库）可达性的影响，
验证前不承诺无损自动迁移。

## 2. 方法（隔离环境，未触碰真实用户数据）

| 步骤 | 操作 |
| --- | --- |
| 1 | 从 git HEAD 导出旧版源码（`name: novel-look-ts`，`publisher: ytx222`，version 2.1.11），`vsce package` 得 `novel-look-ts-old.vsix`（305 KB） |
| 2 | 当前工作树（Phase 0 后，`name: moyu-novel-ts`，`publisher: moyu-novel`，version 2.1.11）`vsce package` 得 `moyu-novel-ts-2.1.11.vsix`（293 KB） |
| 3 | `code --install-extension` 将两个 VSIX 装入同一隔离 `--user-data-dir` / `--extensions-dir` |
| 4 | 对比扩展安装目录 ID；在 user-data 中模拟两个版本的 globalStorage 书库目录并验证迁移方案 |

## 3. 实测结果

### 3.1 扩展 ID（安装目录）

```
<extensions-dir>/
├─ ytx222.novel-look-ts-2.1.11      # 旧身份
└─ moyu-novel.moyu-novel-ts-2.1.11  # 新身份
```

两个 ID 可共存（VS Code 按 `publisher.name` 隔离）。

### 3.2 globalStorage 路径（书库）

```
<user-data>/User/globalStorage/ytx222.novel-look-ts/    # 旧版书库（老用户数据在此）
<user-data>/User/globalStorage/moyu-novel.moyu-novel-ts/ # 新版书库（新扩展只读这里）
```

- 在旧 globalStorage 放入 `示例书.txt` 后，新扩展目录为空 → **新 ID 默认不可达旧书库**。
- 将 `示例书.txt` 复制到新 globalStorage 后可达 → **方案 B（人工复制目录）可行**。

### 3.3 globalState

`globalState` 存储在 `<user-data>/User/globalStorage/state.vscdb`，key 按
`<extensionId>:<key>` 命名空间隔离 → 新 ID 同样读不到旧 `book_*` / `lastOpenChapter`
等状态；需要按 key 映射导入（方案 C）或用户手动重建（方案 B 的已知代价）。

## 4. 结论与决策（已写入 ADR-002）

1. **改名必然形成新的外部扩展 ID**，旧书库与状态默认不可达——不做"自动无损迁移"承诺。
2. 候选路径：
   - **方案 A**：保留旧 ID 续接（若能获得 `novel-look-ts` 的合法续接权）——零迁移成本；
   - **方案 B**：人工复制书库文件（已实测可行），状态需重建；
   - **方案 C**：旧版导出 + 新版导入（Phase 2 状态 schema 落地后实现）。
3. Phase 0 不实现代码级迁移；发布前必须按 README 发布说明执行迁移演练。

## 5. 附带验证

- 新版 VSIX 内容检查（`vsce ls`）：`src/`、`docs/`、`.github/` 已被 .vscodeignore 排除，
  `dist/`、`static/`、`img/`、`LICENSE.txt`、`README.md` 均在包内（34 文件，293 KB）。
- 旧版（含 webpack 遗留）亦可正常打包，说明 Phase 0 清理未破坏打包链路。
