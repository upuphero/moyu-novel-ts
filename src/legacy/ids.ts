/**
 * Legacy 兼容清单（P0-07）。
 *
 * 集中管理"旧身份 / 稳定 ID / 状态 key"的字符串常量与生成函数，
 * 禁止在业务代码中散落硬编码字符串，禁止机械全局替换 namespace。
 *
 * 迁移原则（见 DEVELOPMENT_PLAN.md §3.5 与 ADR-003）：
 * - Phase 0 只建立清单与常量，不迁移内部 namespace。
 * - command/config/view 的 `moyu-novel.* / moyuNovel.*` 迁移在 Phase 9 收口，
 *   届时本文件是唯一需要同步修改的映射点。
 */

/** Extension 包名（发布身份的一部分：publisher.name） */
export const EXTENSION_NAME = "moyu-novel-ts";
/** 展示名 */
export const DISPLAY_NAME = "Moyu Novel";
/** 当前仓库 */
export const REPOSITORY_URL = "https://github.com/upuphero/moyu-novel-ts";

/** 命令 ID 前缀（旧 namespace，Phase 9 迁移为 moyu-novel.） */
export const COMMAND_PREFIX = "novel-look.";
/** 配置项前缀（旧 namespace，Phase 9 迁移为 moyuNovel.） */
export const CONFIG_PREFIX = "novelLook";
/** TreeView ID（已修正 P0-03-6 拼写错误） */
export const TREE_VIEW_ID = "novelLookTreeView";
/** Activity 容器 ID */
export const ACTIVITY_CONTAINER_ID = "novel-look";

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
/* 内置默认配置（package.json 中 novelLook.* 的 default 保持一致）      */
/* ------------------------------------------------------------------ */

/** 默认小说文件名匹配正则（VS Code 配置字符串，无需转义反斜杠） */
export const DEFAULT_NOVEL_NAME_REGEX = "^.*\\.txt$";

/**
 * 默认章节匹配正则（配置字符串形式）。
 * 注意：这是 package.json `novelLook.match.chapterName` 的 default 值，
 * 字符串中的 `\\` 是 JSON 转义后的字面 `\`，用于正则的 `\d`、`\t` 等转义。
 */
export const DEFAULT_CHAPTER_REGEX =
	"^(?:[ \\t\\r\\f\\v]*)(第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*[篇节部卷][ \\t\\r\\f\\v]*.*[ \\t\\r\\f\\v]*)?第[一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟万零〇\\d]*章[^\\n\\r]*$";

/* ------------------------------------------------------------------ */
/* 内置命令 ID（contributions 与注册处共用）                            */
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
} as const;
