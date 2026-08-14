import * as vscode from "vscode";
import { WorkspaceConfiguration } from "vscode";
import { CONFIG_PREFIX, LEGACY_CONFIG_PREFIX } from "./legacy/ids";
import { resolveConfigValue } from "./configCore";

type ENV = "production" | "dev";

let config = {
	env: "production" as ENV,
};

export let env = config.env;
export const setEnv = (e: ENV) => {
	config.env = e;
	env = e;
};

/**
 * 获取 vscode 设置（P9-03：scope-aware 只读 fallback）。
 *
 * 每次调用都重新获取，确保拿到最新值（P0-03-5）。
 * 读取顺序（ADR-002/003）：新 key `moyuNovel.<key>` 显式值
 * → 旧 key `novelLook.<key>` 显式值（兼容窗口内，只读不写回）
 * → 默认值。新设置一律写入新 key（见 `set`）。
 */
export function get<T>(key: string, defaultValue: T): T {
	const newValue = vscode.workspace
		.getConfiguration(CONFIG_PREFIX)
		.get<T | undefined>(key, undefined);
	const legacyValue = vscode.workspace
		.getConfiguration(LEGACY_CONFIG_PREFIX)
		.get<T | undefined>(key, undefined);
	return resolveConfigValue(newValue, legacyValue, defaultValue);
}
/**
 * 设置 vscode 设置（全局 scope；P9-03 起写入新 namespace `moyuNovel.*`）
 * @param key 相对键，如 `readSetting.zoom`
 * @param value 值
 * @param global 是否写入全局 scope（默认 true）
 */
export async function set(
	key: string,
	value: unknown,
	global = true
): Promise<void> {
	const configuration = vscode.workspace.getConfiguration(CONFIG_PREFIX);
	try {
		await configuration.update(key, value, global);
	} catch (error) {
		console.error(`写入配置失败 moyuNovel.${key}`, error);
	}
}

/**
 * 可被 WebView 更新（updateReadSetting）的 key 白名单（P0-10）。
 * 任意消息不能更新未允许的配置；Phase 8 已升级为完整消息 runtime validation，
 * 此处为第二道 key 白名单。
 */
export const ALLOWED_READ_SETTING_KEYS: ReadonlySet<string> = new Set([
	"readSetting.zoom",
	"readSetting.scrollSpeed",
	"readSetting.screenDirection",
]);
