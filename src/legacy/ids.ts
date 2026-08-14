/**
 * Legacy 兼容清单（P0-07）+ Phase 9 namespace 收口。
 *
 * 集中管理"身份 / 稳定 ID / 状态 key"的字符串常量与生成函数，
 * 禁止在业务代码中散落硬编码字符串，禁止机械全局替换 namespace。
 *
 * Phase 9（P9-01/02/05）已按 ADR-003 完成迁移：
 * - 业务代码统一使用新 namespace（moyu-novel.* / moyuNovel.* / moyuNovelTreeView）；
 * - 旧 namespace（novel-look.* / novelLook.* / novelLookTreeView）只保留在
 *   LEGACY_* 常量（供 alias 注册、兼容读取与测试），进入兼容窗口；
 * - 兼容窗口内旧命令 alias 注册到同一 handler；旧配置 key 保留读取 fallback。
 */

/** Extension 包名（发布身份的一部分：publisher.name） */
export const EXTENSION_NAME = "moyu-novel-ts";
/** 展示名 */
export const DISPLAY_NAME = "Moyu Novel";
/** 当前仓库 */
export const REPOSITORY_URL = "https://github.com/upuphero/moyu-novel-ts";

/* ------------------------------------------------------------------ */
/* 新 namespace（业务代码唯一引用，P9-01）                              */
/* ------------------------------------------------------------------ */

/** 命令 ID 前缀（新 namespace，Phase 9 起） */
export const COMMAND_PREFIX = "moyu-novel.";
/** 配置项前缀（新 namespace，Phase 9 起） */
export const CONFIG_PREFIX = "moyuNovel";
/** TreeView ID（新 namespace） */
export const TREE_VIEW_ID = "moyuNovelTreeView";
/** Activity 容器 ID（新 namespace） */
export const ACTIVITY_CONTAINER_ID = "moyu-novel";

/* ------------------------------------------------------------------ */
/* 旧 namespace（legacy 兼容，P9-02/05：alias 注册 / fallback / 测试）   */
/* ------------------------------------------------------------------ */

/** 旧命令 ID 前缀（alias 注册用，兼容窗口内共存） */
export const LEGACY_COMMAND_PREFIX = "novel-look.";
/** 旧配置项前缀（只读 fallback 用） */
export const LEGACY_CONFIG_PREFIX = "novelLook";
/** 旧 TreeView ID（不再贡献 view；仅文档/测试引用） */
export const LEGACY_TREE_VIEW_ID = "novelLookTreeView";
/** 旧 Activity 容器 ID（不再贡献；仅文档/测试引用） */
export const LEGACY_ACTIVITY_CONTAINER_ID = "novel-look";

/* ------------------------------------------------------------------ */
/* 状态 key（globalState），迁移目标见 ADR-003 / P2-02                 */
/* ------------------------------------------------------------------ */

/** 已读章节 key：`book_<书标签>`（只读 key 生成，同名文件冲突问题由 Phase 2 bookId 解决） */
export const readListKey = (bookLabel: string): string => `book_${bookLabel}`;
/** 最近打开章节 key */
export const LAST_OPEN_CHAPTER_KEY = "lastOpenChapter";
/** 是否折叠已读章节 key */
export const IS_SHOW_READ_CHAPTER_KEY = "isShowReadChapter";
/** 像素滚动 key（Phase 2 迁移为语义进度后废弃） */
export const SAVE_SCROLL_KEY = "saveScroll";

/* ------------------------------------------------------------------ */
/* 内置默认配置（package.json 中 moyuNovel.* 的 default 保持一致）       */
/* ------------------------------------------------------------------ */

/** 默认小说文件名匹配正则（VS Code 配置字符串，无需转义反斜杠） */
export const DEFAULT_NOVEL_NAME_REGEX = "^.*\\.txt$";

/**
 * 默认章节匹配正则（配置字符串形式）。
 * 注意：这是 package.json `moyuNovel.match.chapterName` 的 default 值，
 * 字符串中的 `\\` 是 JSON 转义后的字面 `\`，用于正则的 `\d`、`\t` 等转义。
 */
export const DEFAULT_CHAPTER_REGEX =
	"^(?:[ \\t\\r\\f\\v]*)(第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*[篇节部卷][ \\t\\r\\f\\v]*.*[ \\t\\r\\f\\v]*)?第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*章[^\\n\\r]*$";

/* ------------------------------------------------------------------ */
/* 内置命令 ID（contributions 与注册处共用；Phase 9 起为 moyu-novel.*） */
/* ------------------------------------------------------------------ */

export const Command = {
	/** 刷新书架 */
	RefreshFile: `${COMMAND_PREFIX}refreshFile`,
	/** 刷新 static 资源（仅开发用，受 showRefreshStaticFile 控制） */
	RefreshStaticFile: `${COMMAND_PREFIX}refreshStaticFile`,
	/** 打开书库目录 */
	OpenExplorer: `${COMMAND_PREFIX}openExplorer`,
	/** 打开 static 目录 */
	OpenWebViewDir: `${COMMAND_PREFIX}openWebViewDir`,
	/** 打开章节（章节 TreeItem 的 command） */
	ShowChapter: `${COMMAND_PREFIX}showChapter`,
	/** 关闭阅读窗口 */
	CloseWebView: `${COMMAND_PREFIX}closeWebView`,
	/** 打开阅读窗口 */
	OpenWebView: `${COMMAND_PREFIX}openWebView`,
	/** 显示已读章节 */
	ShowReadChapter: `${COMMAND_PREFIX}showReadChapter`,
	/** 折叠已读章节 */
	HideReadChapter: `${COMMAND_PREFIX}hideReadChapter`,
	/** 清空已读章节 */
	ClearReadChapter: `${COMMAND_PREFIX}clearReadChapter`,
	/** 切换下一章（内部命令，无 contributes） */
	NextChapter: `${COMMAND_PREFIX}nextChapter`,
	/** 切换上一章（内部命令，无 contributes） */
	PrevChapter: `${COMMAND_PREFIX}prevChapter`,
	/** 全书搜索（Phase 5） */
	SearchBook: `${COMMAND_PREFIX}searchBook`,
} as const;
