import { useStore } from "./store";

// Compiled lookup structures rebuilt via a store subscription whenever the
// `trackedFolders` setting changes (SettingsTab edits, external sync, config
// load all covered — no manual invalidation needed).  isPathTracked runs on
// every keystroke, so exact-match (Set.has) and descendant-match (startsWith)
// are split into separate structures instead of a per-keystroke
// `prefix + "/"` allocation.
let _cache: {
	exactSet: Set<string>;
	prefixSlashes: string[];
} | null = null;

// Last-entry memo: keystrokes query the same file path in sequence, so a
// single `filePath === _lastPath` check short-circuits the folder scan.
let _lastPath: string | undefined;
let _lastResult: boolean;

function buildFolderCache(folders: string[]): {
	exactSet: Set<string>;
	prefixSlashes: string[];
} {
	// Folders may carry a trailing slash (SettingsTab pushes `folder.path + '/'`);
	// normalize so `p + "/"` doesn't produce `"foo//"` which would never match.
	const normalized = folders.map(p => p.replace(/\/+$/, ""));
	const exactSet = new Set<string>(normalized);
	const prefixSlashes = normalized.map(p => p + "/");
	return { exactSet, prefixSlashes };
}

useStore.subscribe(
	(s) => s.settings.trackedFolders,
	(folders) => {
		_cache = folders && folders.length > 0 ? buildFolderCache(folders) : null;
		_lastPath = undefined;
	},
);

/**
 * Returns true when the given file path should be tracked according to the
 * configured `trackedFolders` setting.
 *
 * - Empty list (default) -> track the whole vault.
 * - Non-empty list -> track only files matching
 *   `filePath === prefix || filePath.startsWith(prefix + "/")`.
 *
 * Matching on `<prefix>/` rather than a bare `startsWith` prevents
 * `20-research` from accidentally matching `20-research-backup`.
 */
export function isPathTracked(filePath: string): boolean {
	if (filePath === _lastPath) {
		return _lastResult;
	}
	let result = true;
	if (_cache) {
		const { exactSet, prefixSlashes } = _cache;
		if (exactSet.has(filePath)) {
			result = true;
		} else {
			result = false;
			for (let i = 0; i < prefixSlashes.length; i++) {
				if (filePath.startsWith(prefixSlashes[i])) {
					result = true;
					break;
				}
			}
		}
	}
	_lastPath = filePath;
	_lastResult = result;
	return result;
}

/**
 * Drop the cached lookup structures.  Called on plugin unload so stale
 * references can't leak into the next load cycle (the subscription rebuilds
 * on settings hydration, but this keeps reset behaviour consistent with the
 * other module-level caches).
 */
export function resetFolderCache(): void {
	_cache = null;
	_lastPath = undefined;
}
