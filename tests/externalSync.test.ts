import assert from "node:assert";
import { useStore } from "@/core/store";
import { handleExternalDataChange } from "@/core/externalSync";
import type { PluginData } from "@/defs/types";

// Minimal window stub — store.requestPersist uses requestAnimationFrame.
(globalThis as any).window = {
	requestAnimationFrame: () => 0,
	setTimeout: () => 0,
	clearTimeout: () => {},
};

const pluginWith = (data: unknown) =>
	({ loadData: async () => data }) as any;

async function main() {
	// ─── 1. Empty external file must NOT wipe local days ───
	const localDays = { "2026-09-01": { "a.md": { w: 10, c: 5 } } };
	useStore.setState({
		today: "2026-09-08",
		days: localDays,
		settings: { preferredUnit: "words" } as any,
	});

	await handleExternalDataChange(pluginWith({} as unknown as PluginData));
	assert.deepStrictEqual(useStore.getState().days, localDays);

	await handleExternalDataChange(pluginWith(null));
	assert.deepStrictEqual(useStore.getState().days, localDays);

	// stats present but no rows (e.g. fileDict/days mismatch shape)
	await handleExternalDataChange(
		pluginWith({ stats: { fileDict: {}, days: {} } } as unknown as PluginData),
	);
	assert.deepStrictEqual(useStore.getState().days, localDays);

	// ─── 2. External with rows still merges — max per key wins ───
	await handleExternalDataChange(
		pluginWith({
			stats: {
				fileDict: { "a.md": 0, "b.md": 1 },
				days: {
					"2026-09-01": { "0": { w: 3, c: 2 } }, // smaller → local kept
					"2026-09-02": { "1": { w: 7, c: 1 } }, // local-only key dropped
				},
			},
		} as unknown as PluginData),
	);
	assert.deepStrictEqual(useStore.getState().days, {
		"2026-09-01": { "a.md": { w: 10, c: 5 } },
		"2026-09-02": { "b.md": { w: 7, c: 1 } },
	});

	console.log("externalSync tests passed");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
