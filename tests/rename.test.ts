import assert from "node:assert";
import { useStore } from "@/core/store";
import { mergeExternalStats } from "@/core/externalSync";
import type { PersistedStats } from "@/defs/types";

// Minimal window stub — store.requestPersist uses requestAnimationFrame.
(globalThis as any).window = {
	requestAnimationFrame: () => 0,
	setTimeout: () => 0,
	clearTimeout: () => {},
};

const TODAY = "2026-09-08";
const OLD = "notes/X.md";
const NEW = "notes/Y.md";

/**
 * Seed the local side of a rename: today's row/baseline for the OLD path,
 * plus optional extra days.
 */
function seed(
	oldRow: { w: number; c: number },
	oldBaseline: { w: number; c: number },
	extraDays: Record<string, Record<string, { w: number; c: number }>> = {},
) {
	useStore.setState({
		today: TODAY,
		days: { [TODAY]: { [OLD]: { ...oldRow } }, ...extraDays },
		todayBaselines: { [OLD]: { ...oldBaseline } },
		todayBaselinesDay: TODAY,
		activeFiles: new Set([OLD]),
	});
}

/** The other device already renamed the file: its stats carry the NEW path. */
function otherDevice(
	rowsByDay: Record<string, { w: number; c: number }>,
	baseline?: { w: number; c: number },
	day = TODAY,
): PersistedStats {
	return {
		fileDict: { [NEW]: 0 },
		days: { [day]: { "0": { ...rowsByDay[day] } } },
		...(baseline && {
			todayBaselines: { day: TODAY, baselines: { "0": { ...baseline } } },
		}),
	} as PersistedStats;
}

const rowToday = () => useStore.getState().days[TODAY];

async function main() {
	// ─── 1. Merge first, rename second, remote row LARGER: the row that just
	// arrived from the other device must win (the plain-assignment bug ate it).
	// The merge lands while both paths are still in the store — that collision
	// state is asserted explicitly, it is what makes the rename dangerous. ───
	seed({ w: 50, c: 50 }, { w: 1000, c: 1000 });
	await mergeExternalStats(
		otherDevice({ [TODAY]: { w: 100, c: 400 } }, { w: 900, c: 3600 }),
	);
	assert.deepStrictEqual(
		rowToday(),
		{ [OLD]: { w: 50, c: 50 }, [NEW]: { w: 100, c: 400 } },
		"merge keeps the local old-path row next to the remote new-path row",
	);

	useStore.getState().renameFilePath(OLD, NEW);
	let st = useStore.getState();
	assert.deepStrictEqual(
		st.days[TODAY],
		{ [NEW]: { w: 100, c: 400 } },
		"the larger remote row must survive the rename",
	);
	assert.deepStrictEqual(
		st.todayBaselines,
		{ [NEW]: { w: 900, c: 3600 } },
		"the winning row's baseline must travel with it",
	);

	// ─── 2. Same order, local row larger: the local value wins instead. ───
	seed({ w: 150, c: 150 }, { w: 500, c: 500 });
	await mergeExternalStats(
		otherDevice({ [TODAY]: { w: 100, c: 400 } }, { w: 900, c: 3600 }),
	);
	useStore.getState().renameFilePath(OLD, NEW);
	st = useStore.getState();
	assert.deepStrictEqual(st.days[TODAY], { [NEW]: { w: 150, c: 150 } });
	assert.deepStrictEqual(st.todayBaselines, { [NEW]: { w: 500, c: 500 } });

	// ─── 3. Reverse arrival order (rename first, merge second) converges to
	// the same result — the outcome no longer depends on sync timing. ───
	seed({ w: 50, c: 50 }, { w: 1000, c: 1000 });
	useStore.getState().renameFilePath(OLD, NEW);
	assert.deepStrictEqual(
		rowToday(),
		{ [NEW]: { w: 50, c: 50 } },
		"a rename with no competing target row still moves the row",
	);
	await mergeExternalStats(
		otherDevice({ [TODAY]: { w: 100, c: 400 } }, { w: 900, c: 3600 }),
	);
	st = useStore.getState();
	assert.deepStrictEqual(st.days[TODAY], { [NEW]: { w: 100, c: 400 } });
	assert.deepStrictEqual(st.todayBaselines, { [NEW]: { w: 900, c: 3600 } });

	// ─── 4. Historical days take the same max rule.  The collision is only
	// reachable there when the external file is a rolled-back one
	// (allowDeletions: false), which is exactly when it can bite. ───
	seed(
		{ w: 10, c: 10 },
		{ w: 1, c: 1 },
		{ "2026-09-01": { [OLD]: { w: 20, c: 20 } } },
	);
	await mergeExternalStats(
		otherDevice(
			{ "2026-09-01": { w: 30, c: 30 } },
			undefined,
			"2026-09-01",
		),
		{ allowDeletions: false },
	);
	assert.deepStrictEqual(useStore.getState().days["2026-09-01"], {
		[OLD]: { w: 20, c: 20 },
		[NEW]: { w: 30, c: 30 },
	});
	useStore.getState().renameFilePath(OLD, NEW);
	assert.deepStrictEqual(useStore.getState().days["2026-09-01"], {
		[NEW]: { w: 30, c: 30 },
	});

	console.log("rename tests passed");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
