import { VIEW_TYPE } from "@/ui/views/PluginView";

import { getPlugin } from "./pluginRegistry";
import {
	CustomCodeBlockType,
	getCustomCodeBlockTemplate,
} from "@/core/codeBlockTemplates";
import { Editor, MarkdownView, Notice } from "obsidian";

/**
 * @function activateSidebarView opens the SIDEBAR plugin view
 */
export async function activateSidebarView() {
	const app = getPlugin().app;
	const leaf = await app.workspace.ensureSideLeaf(VIEW_TYPE, "right", {
		active: true,
		reveal: true,
		split: true,
	});

	if (leaf) {
		app.workspace.setActiveLeaf(leaf, {
			focus: true,
		});
	}
}

export function insertCustomCodeBlock(
	type: CustomCodeBlockType,
	editor?: Editor,
) {
	const activeEditor =
		editor ??
		getPlugin().app.workspace.getActiveViewOfType(MarkdownView)?.editor;

	if (!activeEditor) {
		new Notice("Ktr: Open a Markdown file to insert a code block.");
		return;
	}

	activeEditor.replaceSelection(`${getCustomCodeBlockTemplate(type)}\n`);
}