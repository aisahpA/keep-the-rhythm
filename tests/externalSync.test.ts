import assert from "node:assert";
import { useStore } from "@/core/store";
import { mergeExternalSettings, mergeExternalStats } from "@/core/externalSync";
import type { PersistedStats, PluginData } from "@/defs/types";

// Minimal window stub — store.requestPersist uses requestAnimationFrame.
(globalThis as any).window = {
	requestAnimationFrame: () => 0,
	setTimeout: () => 0,
	clearTimeout: () => {},
};

async function main() {
	// ─── 1. Empty external stats must NOT wipe local days ───
	const localDays = { "2026-09-01": { "a.md": { w: 10, c: 5 } } };
	useStore.setState({
		today: "2026-09-08",
		days: localDays,
		settings: { preferredUnit: "words" } as any,
	});

	await mergeExternalStats(undefined);
	assert.deepStrictEqual(useStore.getState().days, localDays);

	await mergeExternalStats({ fileDict: {}, days: {} });
	assert.deepStrictEqual(useStore.getState().days, localDays);

	// ─── 2. External with rows still merges — max per key wins ───
	await mergeExternalStats({
		fileDict: { "a.md": 0, "b.md": 1 },
		days: {
			"2026-09-01": { "0": { w: 3, c: 2 } }, // smaller → local kept
			"2026-09-02": { "1": { w: 7, c: 1 } }, // local-only key dropped
		},
	} as PersistedStats);
	assert.deepStrictEqual(useStore.getState().days, {
		"2026-09-01": { "a.md": { w: 10, c: 5 } },
		"2026-09-02": { "b.md": { w: 7, c: 1 } },
	});

	// ─── 3. TODAY's local-only row survives an external file that lacks it:
	// transient sync states (delete-then-re-add, rolled-back replays) must
	// not delete the one day still being written — and the kept row must
	// bring its baseline along, or the next editorCount - baseline is wrong. ───
	useStore.setState({
		today: "2026-09-08",
		days: {
			"2026-09-08": { "c.md": { w: 9, c: 9 } },
			"2026-09-01": { "a.md": { w: 10, c: 5 } },
		},
		todayBaselines: { "c.md": { w: 100, c: 100 } },
		todayBaselinesDay: "2026-09-08",
	});
	await mergeExternalStats({
		fileDict: { "a.md": 0, "b.md": 1 },
		days: {
			"2026-09-08": { "1": { w: 4, c: 4 } }, // b.md, new row
			"2026-09-01": { "0": { w: 10, c: 5 } },
		},
	} as PersistedStats);
	assert.deepStrictEqual(useStore.getState().days, {
		"2026-09-08": { "c.md": { w: 9, c: 9 }, "b.md": { w: 4, c: 4 } },
		"2026-09-01": { "a.md": { w: 10, c: 5 } },
	});
	assert.deepStrictEqual(
		useStore.getState().todayBaselines,
		{ "c.md": { w: 100, c: 100 } },
		"a kept local-only row must keep its local baseline",
	);

	// ─── 4. A rolled-back (older) external file has no deletion authority:
	// its rows merge, but its missing rows must not delete anything. ───
	useStore.setState({
		today: "2026-09-08",
		days: {
			"2026-09-08": { "c.md": { w: 9, c: 9 } },
			"2026-09-01": { "a.md": { w: 10, c: 5 } },
		},
		todayBaselines: { "c.md": { w: 100, c: 100 } },
		todayBaselinesDay: "2026-09-08",
	});
	await mergeExternalStats(
		{
			fileDict: { "b.md": 0 },
			days: { "2026-09-02": { "0": { w: 7, c: 1 } } },
		} as PersistedStats,
		{ allowDeletions: false },
	);
	assert.deepStrictEqual(useStore.getState().days, {
		"2026-09-08": { "c.md": { w: 9, c: 9 } },
		"2026-09-01": { "a.md": { w: 10, c: 5 } },
		"2026-09-02": { "b.md": { w: 7, c: 1 } },
	});

	// ─── 5. Settings merge: external overwrites, normalized with defaults ───
	await mergeExternalSettings({
		settings: { dailyWritingGoal: 250 },
	} as unknown as PluginData);
	assert.strictEqual(useStore.getState().settings.dailyWritingGoal, 250);
	assert.strictEqual(useStore.getState().settings.preferredUnit, "WORD"); // default backfilled

	// identical payload is a no-op (same settings reference)
	const before = useStore.getState().settings;
	await mergeExternalSettings({
		settings: { dailyWritingGoal: 250 },
	} as unknown as PluginData);
	assert.strictEqual(useStore.getState().settings, before);

	console.log("externalSync tests passed");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
