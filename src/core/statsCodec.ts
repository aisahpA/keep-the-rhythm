import {
	DayActivityMap,
	DaysMap,
	LegacyActivityData,
	PersistedBaselines,
	PersistedDaysMap,
	PersistedFileDict,
} from "@/defs/types";

/*
 * Stats codec — the ONLY module that knows about the split between the
 * persisted shape (dictionary-encoded maps in data.json) and the store's
 * runtime state (full file paths everywhere).
 *
 *   Persisted                                   Runtime (store)
 *   ─────────                                   ─────────────────
 *   stats.fileDict (path → numeric ID)    │
 *   stats.days[date] (id → added)         ├──▶   days: date → filePath → added
 *   stats.todayBaselines.baselines        ──▶   todayBaselines: filePath → initial count
 *   stats.todayBaselines.day              ──▶   todayBaselinesDay: date baselines belong to
 *
 *   Dictionary encoding replaces repeated file-path strings in `days`
 *   and `todayBaselines` with small integer IDs, cutting storage by
 *   ~60–65% for multi-month histories.
 *
 *   Backward compat: legacy `stats.dailyActivity` (array of rows) is
 *   accepted transparently on decode and migrated. Encoding always
 *   writes the new dictionary-encoded format.
 */

// ─── File dictionary cache ───
let cachedFileDict: PersistedFileDict = {};
let cachedNextId = 0;
let lastDictSize = 0;

function setCachedFileDict(dict: PersistedFileDict): void {
	cachedFileDict = { ...dict };
	cachedNextId = Object.values(dict).reduce((m, v) => Math.max(m, v + 1), 0);
}

// ─── Encoded historical partition cache ───
// Keystrokes only change today's row, so we cache the encoded historical
// partition keyed by (today, historicalVersion) and skip re-scanning it.
let cachedEncToday = "";
let cachedEncHistVer = -1;
let cachedEncHistoricalDays: PersistedDaysMap = {};

/**
 * Reset all module-level codec caches (file dict + encoded historical
 * partition).  Called on plugin unload so stale state can't leak into the
 * next load cycle.
 */
export function resetStatsCodecCache(): void {
	cachedFileDict = {};
	cachedNextId = 0;
	lastDictSize = 0;
	cachedEncToday = "";
	cachedEncHistVer = -1;
	cachedEncHistoricalDays = {};
}

export interface DecodedActivities {
	days: DaysMap;
	todayBaselines: DayActivityMap;
	todayBaselinesDay: string | null;
	activeFiles: Set<string>;
}

type StatsInput =
	| {
			days?: DaysMap | PersistedDaysMap;
			fileDict?: PersistedFileDict;
			todayBaselines?: PersistedBaselines;
			dailyActivity?: LegacyActivityData[];
	  }
	| undefined;

function hasFileDict(
	stats: StatsInput,
): stats is NonNullable<StatsInput> & { fileDict: PersistedFileDict } {
	return !!stats?.fileDict && Object.keys(stats.fileDict).length > 0;
}

function buildIdToPath(fileDict: PersistedFileDict): string[] {
	const idToPath: string[] = [];
	for (const [path, id] of Object.entries(fileDict)) idToPath[id] = path;
	return idToPath;
}

function legacyRowsToDays(rows: LegacyActivityData[] | undefined): DaysMap {
	const days: DaysMap = {};
	for (const r of rows ?? []) {
		(days[r.date] ??= {})[r.filePath] = r.wordsAdded;
	}
	return days;
}

/**
 * Collect every filePath that appears in any day map.
 * Used to seed the activeFiles set at load time.
 */
export function collectActiveFiles(days: DaysMap): Set<string> {
	return new Set(Object.values(days).flatMap((d) => Object.keys(d)));
}

function encodeDayMap(
	day: DayActivityMap,
): Record<string, number> {
	const encoded: Record<string, number> = {};
	for (const [path, val] of Object.entries(day)) {
		const id = cachedFileDict[path];
		if (id !== undefined) encoded[String(id)] = val;
	}
	return encoded;
}

/**
 * Decode a single dictionary-encoded day map (id → value) back to
 * (path → value) using the given id→path array.
 */
function decodeDayMap(
	encoded: Record<string, number>,
	idToPath: string[],
): DayActivityMap {
	const day: DayActivityMap = {};
	for (const [idStr, val] of Object.entries(encoded)) {
		const path = idToPath[Number(idStr)];
		if (path !== undefined) day[path] = val;
	}
	return day;
}

/**
 * Prune zero-added rows out of a single day map and encode it, assigning
 * a new auto-incremented ID to any path not yet in the dictionary.
 * Returns the encoded map (empty when the day had no positive rows) plus
 * the running nextId.
 */
function encodeDay(
	day: DayActivityMap,
	nextId: number,
): { encoded: Record<string, number>; nextId: number } {
	const kept: DayActivityMap = {};
	for (const [filePath, added] of Object.entries(day)) {
		if (added > 0) {
			kept[filePath] = added;
			if (!(filePath in (cachedFileDict ?? {}))) {
				cachedFileDict ??= {};
				cachedFileDict[filePath] = nextId++;
			}
		}
	}
	return kept
		? { encoded: encodeDayMap(kept), nextId }
		: { encoded: {}, nextId };
}

function encodeBaselines(
	todayBaselines: DayActivityMap,
	todayDay: DayActivityMap,
	today: string,
	todayBaselinesDay: string | null,
): PersistedBaselines | undefined {
	if (todayBaselinesDay !== today) return undefined;
	const kept: DayActivityMap = {};
	for (const [filePath, baseline] of Object.entries(todayBaselines)) {
		if ((todayDay[filePath] ?? 0) > 0) kept[filePath] = baseline;
	}
	if (!Object.keys(kept).length) return undefined;
	return { day: today, baselines: encodeDayMap(kept) };
}

/**
 * Ensure the cached encoded historical partition (all dates except today)
 * is up to date with the current (today, historicalVersion) key.  The
 * historical partition is stable across keystrokes — it only changes when
 * today rolls over, historical data is edited, or an external sync
 * replaces the data — so on a cache hit this is a no-op and saves re-
 * scanning the whole history on every save.
 *
 * Returns the running nextId (a cache (re)build may have assigned new IDs).
 */
function ensureHistoricalDays(
	inputDays: DaysMap,
	today: string,
	historicalVersion: number,
	nextId: number,
): number {
	if (today === cachedEncToday && historicalVersion === cachedEncHistVer)
		return nextId;

	const encoded: PersistedDaysMap = {};
	for (const [date, day] of Object.entries(inputDays)) {
		if (date === today) continue;
		const { encoded: encDay, nextId: nid } = encodeDay(day, nextId);
		nextId = nid;
		if (Object.keys(encDay).length > 0) encoded[date] = encDay;
	}
	cachedEncHistoricalDays = encoded;
	cachedEncToday = today;
	cachedEncHistVer = historicalVersion;
	return nextId;
}

/**
 * Decode the persisted `days` into the store's path-keyed shape.  Handles
 * the two real-world input shapes:
 *
 *   1. Dictionary-encoded (fileDict present, id-keyed days) — current
 *   2. Legacy `dailyActivity` array — the historical structure on master
 *
 * The intermediate plain path-keyed `days` shape (no fileDict) was written
 * but never officially released, so it is not handled here.
 */
function decodeDays(stats: StatsInput): DaysMap {
	const rawDays = stats?.days;
	if (hasFileDict(stats) && rawDays && Object.keys(rawDays).length > 0) {
		const idToPath = buildIdToPath(stats.fileDict);
		const days: DaysMap = {};
		for (const [date, encDay] of Object.entries(rawDays)) {
			days[date] = decodeDayMap(encDay, idToPath);
		}
		return days;
	}
	return legacyRowsToDays(stats?.dailyActivity);
}

/**
 * Decode today's baselines.  Baselines follow the same encoding rule as
 * `days` (id-keyed when a fileDict is present);
 * legacy `dailyActivity` rows carry today's starting word count inline.
 */
function decodeBaselines(
	stats: StatsInput,
	today: string,
): { todayBaselines: DayActivityMap; todayBaselinesDay: string | null } {
	const persisted = stats?.todayBaselines;
	if (persisted?.day === today && persisted.baselines && hasFileDict(stats)) {
		return {
			todayBaselines: decodeDayMap(persisted.baselines, buildIdToPath(stats.fileDict)),
			todayBaselinesDay: today,
		};
	}

	if (stats?.dailyActivity) {
		const todayBaselines: DayActivityMap = {};
		for (const r of stats.dailyActivity) {
			if (r.date === today) todayBaselines[r.filePath] = r.wordCountStart;
		}
		return {
			todayBaselines,
			todayBaselinesDay: Object.keys(todayBaselines).length > 0 ? today : null,
		};
	}

	return { todayBaselines: {}, todayBaselinesDay: null };
}

/**
 * Seed the cached file dictionary (used by encode for ID stability).  A
 * persisted dict is reused as-is; otherwise fresh IDs are assigned in
 * sorted path order for deterministic, cross-device-consistent IDs.
 */
function resolveFileDict(stats: StatsInput, activeFiles: Set<string>): void {
	if (hasFileDict(stats)) {
		setCachedFileDict(stats.fileDict);
		return;
	}
	const dict: PersistedFileDict = {};
	let id = 0;
	for (const p of [...activeFiles].sort()) dict[p] = id++;
	setCachedFileDict(dict);
}

function filterOrphanedFileDict(
	days: PersistedDaysMap,
	baselines: PersistedBaselines | undefined,
): PersistedFileDict {
	const usedIds = new Set<string>();
	for (const dayMap of Object.values(days)) {
		for (const id of Object.keys(dayMap)) usedIds.add(id);
	}
	if (baselines?.baselines) {
		for (const id of Object.keys(baselines.baselines)) usedIds.add(id);
	}
	const filtered: PersistedFileDict = {};
	for (const [path, id] of Object.entries(cachedFileDict)) {
		if (usedIds.has(String(id))) filtered[path] = id;
	}
	return filtered;
}

/**
 * Decode the persisted `stats` section into the store's single `days`
 * map plus the current-day baselines.  Legacy rows for today also seed
 * baselines from their `wordCountStart`.
 */
export function decodeActivities(
	stats: StatsInput,
	today: string,
): DecodedActivities {
	const days = decodeDays(stats);
	const { todayBaselines, todayBaselinesDay } = decodeBaselines(stats, today);
	const activeFiles = collectActiveFiles(days);
	resolveFileDict(stats, activeFiles);
	return { days, todayBaselines, todayBaselinesDay, activeFiles };
}

/**
 * Assemble the persisted `stats` section from the store.  Writes the
 * dictionary-encoded format: a `fileDict` (path → numeric ID) plus
 * id-keyed `days` and `todayBaselines`.
 *
 * Empty day maps (no rows at all) are dropped to keep the file small;
 * `todayBaselines` is only written when it is still valid (recorded
 * for the current day) and non-empty.
 *
 * The historical partition is cached across saves (see
 * `ensureHistoricalDays`); only today's live row is re-encoded on each
 * save, so per-keystroke persistence is O(files today).
 */
export function encodePersistedStats({
	today,
	days: inputDays,
	todayBaselines,
	todayBaselinesDay,
	historicalVersion,
}: {
	today: string;
	days: DaysMap;
	todayBaselines: DayActivityMap;
	todayBaselinesDay: string | null;
	historicalVersion: number;
}): {
	fileDict: PersistedFileDict;
	days: PersistedDaysMap;
	todayBaselines?: PersistedBaselines;
} {
	let nextId = cachedNextId;

	nextId = ensureHistoricalDays(inputDays, today, historicalVersion, nextId);

	// Today's live row: re-encoded fresh on every save.
	const todayDay = inputDays[today] ?? {};
	const { encoded: encodedTodayDay, nextId: todayNextId } = encodeDay(
		todayDay,
		nextId,
	);
	cachedNextId = todayNextId;

	const days: PersistedDaysMap = {
		...cachedEncHistoricalDays,
		...(Object.keys(encodedTodayDay).length > 0 ? { [today]: encodedTodayDay } : {}),
	};

	const encodedBaselines = encodeBaselines(
		todayBaselines,
		todayDay,
		today,
		todayBaselinesDay,
	);

	// Drop orphaned fileDict entries (left behind by file renames).
	// Cache only grows (never shrinks), but !== is safer than > because
	// it catches both directions without relying on the monotonicity
	// assumption holding in practice.
	// Cache stays as-is (IDs never decrease); only the persisted output
	// is filtered to the paths still referenced by `days`.
	const outputFileDict = Object.keys(cachedFileDict).length !== lastDictSize
		? filterOrphanedFileDict(days, encodedBaselines)
		: cachedFileDict;
	lastDictSize = Object.keys(cachedFileDict).length;

	return {
		fileDict: outputFileDict,
		days,
		...(encodedBaselines && { todayBaselines: encodedBaselines }),
	};
}
