import assert from "node:assert";
import { useStore } from "@/core/store";
import {
	defaultStatsFilePath,
	getStatsFilePath,
	switchStatsFile,
	saveSettingsToDisk,
	saveStatsToDisk,
} from "@/core/dataPersistence";
import type { Plugin } from "obsidian";

// Minimal window stub — store.requestPersist uses requestAnimationFrame.
(globalThis as any).window = {
	requestAnimationFrame: () => 0,
	setTimeout: () => 0,
	clearTimeout: () => {},
};

/** In-memory vault adapter with mtime bookkeeping for the external-change check. */
class FakeAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	mtimes = new Map<string, number>();
	private clock = 1;

	async exists(p: string): Promise<boolean> {
		return this.files.has(p) || this.folders.has(p);
	}
	async read(p: string): Promise<string> {
		const v = this.files.get(p);
		if (v === undefined) throw new Error("missing " + p);
		return v;
	}
	async write(p: string, data: string): Promise<void> {
		this.files.set(p, data);
		this.mtimes.set(p, this.clock++);
	}
	async remove(p: string): Promise<void> {
		this.files.delete(p);
		this.mtimes.delete(p);
	}
	async mkdir(p: string): Promise<void> {
		this.folders.add(p);
	}
	async stat(p: string): Promise<{ mtime: number } | null> {
		return this.files.has(p) ? { mtime: this.mtimes.get(p) ?? 0 } : null;
	}
}

const makePlugin = (adapter: FakeAdapter) =>
	({
		manifest: { dir: ".obsidian/plugins/ktr2" },
		app: { vault: { adapter } },
		saved: null as unknown,
		saveData: async function (this: { saved: unknown }, d: unknown) {
			this.saved = d;
		},
	}) as unknown as Plugin & { saved: any };

async function main() {
	const adapter = new FakeAdapter();
	const plugin = makePlugin(adapter);
	const defaultPath = ".obsidian/plugins/ktr2/stats.json";
	assert.strictEqual(defaultStatsFilePath(plugin), defaultPath);

	// ─── 1. Path validation ───
	assert.strictEqual(await switchStatsFile(plugin, "notes/../stats.json"), false);
	assert.strictEqual(await switchStatsFile(plugin, "/abs/stats.json"), false);
	assert.strictEqual(await switchStatsFile(plugin, "notes\\stats.json"), false);
	assert.strictEqual(await switchStatsFile(plugin, "notes/stats.txt"), false);
	assert.strictEqual(getStatsFilePath(plugin), defaultPath);
	assert.strictEqual(adapter.files.size, 0);

	// ─── 2. Plain switch: store data lands at the target, old file removed ───
	useStore.setState({
		today: "2026-09-08",
		days: { "2026-09-01": { "a.md": { w: 10, c: 5 } } },
	});
	adapter.files.set(
		defaultPath,
		JSON.stringify({ schema: "0.5", stats: { days: {} } }),
	);

	assert.strictEqual(await switchStatsFile(plugin, "notes/ktr-stats.json"), true);
	assert.ok(adapter.files.has("notes/ktr-stats.json"));
	assert.ok(!adapter.files.has(defaultPath));
	assert.strictEqual(
		useStore.getState().settings.statsFileName,
		"notes/ktr-stats.json",
	);
	assert.strictEqual(getStatsFilePath(plugin), "notes/ktr-stats.json");

	const written = JSON.parse(adapter.files.get("notes/ktr-stats.json")!);
	assert.ok(written.stats.days["2026-09-01"]);
	assert.ok(written.stats.fileDict["a.md"] !== undefined); // dictionary-encoded

	// ─── 3. Switching onto an existing file adopts + merges (max wins) ───
	adapter.files.set(
		"other/stats.json",
		JSON.stringify({
			schema: "0.5",
			stats: {
				fileDict: { "a.md": 0, "b.md": 1 },
				days: {
					"2026-09-01": { "0": { w: 3, c: 2 } }, // smaller → local kept
					"2026-09-02": { "1": { w: 7, c: 1 } }, // external-only row adopted
				},
			},
		}),
	);
	assert.strictEqual(await switchStatsFile(plugin, "other/stats.json"), true);
	assert.deepStrictEqual(useStore.getState().days["2026-09-01"], {
		"a.md": { w: 10, c: 5 },
	});
	assert.deepStrictEqual(useStore.getState().days["2026-09-02"], {
		"b.md": { w: 7, c: 1 },
	});
	assert.ok(!adapter.files.has("notes/ktr-stats.json")); // old file removed

	// ─── 4. Unreadable target blocks the switch, nothing touched ───
	adapter.folders.add("bad");
	adapter.files.set("bad/stats.json", "not json");
	const daysBefore = JSON.parse(JSON.stringify(useStore.getState().days));
	assert.strictEqual(await switchStatsFile(plugin, "bad/stats.json"), false);
	assert.deepStrictEqual(useStore.getState().days, daysBefore);
	assert.strictEqual(
		useStore.getState().settings.statsFileName,
		"other/stats.json",
	);
	assert.ok(adapter.files.has("other/stats.json"));

	// ─── 5. Split save: settings → saveData (no stats), stats → adapter ───
	await saveSettingsToDisk(plugin);
	assert.ok(plugin.saved);
	assert.strictEqual(plugin.saved.stats, undefined);
	assert.strictEqual(plugin.saved.settings.statsFileName, "other/stats.json");
	await saveStatsToDisk(plugin);
	const statsWritten = JSON.parse(adapter.files.get("other/stats.json")!);
	assert.ok(statsWritten.stats);
	assert.strictEqual(plugin.saved.schema, statsWritten.schema);

	console.log("statsFile tests passed");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
