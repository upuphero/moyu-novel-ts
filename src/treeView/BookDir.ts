import * as vscode from "vscode";
import { FileTreeItem, getFileName } from "../file/fileUtil";
import { getExtensionUri } from "../util/util";
import { parseTree } from "./TreeViewProvider";
import { Book } from "./Book";

export class BookDir extends vscode.TreeItem {
	constructor(item: FileTreeItem, map?: Map<string, Book>) {
		super(getFileName(item.item));
		this.label = this.tooltip = getFileName(item.item);
		this.collapsibleState = 1; // 可展开，未展开
		this.iconPath = vscode.Uri.joinPath(getExtensionUri(), "img/dir.png");

		// 先存下来，等访问时再初始化
		this.child = item.child || [];
		// P0-03-4：持有 bookMap 引用，惰性展开时也写入同一索引
		this.map = map;
	}
	type = "dir" as const;
	child: FileTreeItem[] = [];
	map?: Map<string, Book>;

	async getChildren() {
		return parseTree(this.child, this.map);
	}
}
