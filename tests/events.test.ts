import assert from "node:assert";
import type { TFile } from "obsidian";

import { useStore } from "@/core/store";
import { setPlugin } from "@/core/pluginRegistry";
import { handleFileDelete } from "@/core/events";
import { DEFAULT_SETTINGS } from "@/defs/types";

// Minimal window stub — store.requestPersist uses requestAnimationFrame and
// the delete grace period uses setTimeout.
(globalThis as any).window = {
	requestAnimationFrame: () => 0,
	setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
	clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
};

// Vault stand-in: only getAbstractFileByPath is consulted by the delete path.
const present = new Set<string>();
setPlugin({
	app: {
		vault: {
			getAbstractFileByPath: (p: string) => (present.has(p) ? { path: p } : null),
		},
	},
} as any);

const TODAY = "2026-09-08";
const PATH = "notes/a.md";
const ROW = { w: 120, c: 480 };
const BASELINE = { w: 1000, c: 4000 };
const file = { path: PATH, extension: "md" } as unknown as TFile;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Past DELETE_CONFIRM_MS (2s) in events.ts. */
const GRACE = 2300;

function seed(settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
	useStore.setState({
		today: TODAY,
		days: {
			[TODAY]: { [PATH]: { ...ROW } },
			"2026-09-01": { "old.md": { w: 5, c: 5 } },
		},
		todayBaselines: { [PATH]: { ...BASELINE } },
		todayBaselinesDay: TODAY,
		settings: { ...DEFAULT_SETTINGS, ...settings },
	});
}

const rowToday = () => useStore.getState().days[TODAY]?.[PATH];

async function main() {
	// ─── 1. Transient delete (sync "delete then re-add", iCloud eviction):
	// the file is gone when the event fires but is back within the grace
	// period, so today's row AND its baseline must survive. ───
	seed();
	present.delete(PATH);
	handleFileDelete(file);
	present.add(PATH);
	await sleep(GRACE);
	assert.deepStrictEqual(
		rowToday(),
		ROW,
		"row must survive a re-created file",
	);
	assert.deepStrictEqual(
		useStore.getState().todayBaselines[PATH],
		BASELINE,
		"baseline must survive a re-created file",
	);

	// ─── 2. Real delete: confirmed after the grace period, today's row and
	// baseline go away, other days are untouched.  A repeated delete event
	// for the same path must not change that (and must not stack timers). ───
	seed();
	present.delete(PATH);
	handleFileDelete(file);
	handleFileDelete(file);
	await sleep(GRACE);
	assert.strictEqual(
		rowToday(),
		undefined,
		"row must be removed once the file is really gone",
	);
	assert.strictEqual(
		useStore.getState().todayBaselines[PATH],
		undefined,
		"baseline must be removed once the file is really gone",
	);
	assert.deepStrictEqual(useStore.getState().days["2026-09-01"], {
		"old.md": { w: 5, c: 5 },
	});

	// ─── 3. Never a delete target: the stats data file itself (json, so a
	// delete event for it can never wipe rows) and paths outside the
	// tracked folders.  The file is absent from the vault, so a missing
	// guard would delete the row. ───
	seed({ trackedFolders: ["notes"] });
	present.clear();
	handleFileDelete({
		path: ".obsidian/plugins/keep-the-rhythm2/stats.json",
		extension: "json",
	} as unknown as TFile);
	handleFileDelete({
		path: "elsewhere/b.md",
		extension: "md",
	} as unknown as TFile);
	await sleep(GRACE);
	assert.deepStrictEqual(rowToday(), ROW);

	// ─── 4. "Ignore deleted files" keeps the row even for a real delete. ───
	seed({ ignoreDeletedFiles: true, trackedFolders: [] });
	present.delete(PATH);
	handleFileDelete(file);
	await sleep(GRACE);
	assert.deepStrictEqual(rowToday(), ROW);

	console.log("events.test.ts: ok");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
