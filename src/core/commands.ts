import { VIEW_TYPE } from "@/ui/views/PluginView";

import { getPlugin } from "./pluginRegistry";

/**
 * @function activateSidebarView opens the SIDEBAR plugin view
 */
export async function activateSidebarView() {
	const app = getPlugin().app;
	// If the view already exists, reveal it and return
	const existing = app.workspace.getLeavesOfType(VIEW_TYPE);
	if (existing.length > 0) {
		await app.workspace.revealLeaf(existing[0]);
		return;
	}

	// Get the leaf and focus on it
	const leaf = app.workspace.getRightLeaf(false);
	if (leaf) {
		await leaf.setViewState({
			type: VIEW_TYPE,
			active: true,
		});
	}
}
