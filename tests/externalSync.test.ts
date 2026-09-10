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

	// ─── 3. Settings merge: external overwrites, normalized with defaults ───
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
