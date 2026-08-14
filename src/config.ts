import * as vscode from "vscode";
import { WorkspaceConfiguration } from "vscode";
import { CONFIG_PREFIX } from "./legacy/ids";

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
 * 获取 vscode 设置
 * 每次调用都重新获取，确保拿到最新值（P0-03-5）
 */
export function get<T>(key: string, defaultValue: T): T {
	const configuration = vscode.workspace.getConfiguration(CONFIG_PREFIX);
	const value = configuration.get<T | undefined>(key, undefined);
	// 显式 undefined（未设置）时返回默认值，避免把用户的 undefined 写回
	return value === undefined ? defaultValue : value;
}
/**
 * 设置 vscode 设置（全局 scope；scope 迁移记录见 ADR-003，Phase 2 处理）
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
		console.error(`写入配置失败 novelLook.${key}`, error);
	}
}

/**
 * 可被 WebView 更新（updateReadSetting）的 key 白名单（P0-10）。
 * 任意消息不能更新未允许的配置；Phase 8 将升级为完整消息 runtime validation。
 */
export const ALLOWED_READ_SETTING_KEYS: ReadonlySet<string> = new Set([
	"readSetting.zoom",
	"readSetting.scrollSpeed",
	"readSetting.screenDirection",
]);
