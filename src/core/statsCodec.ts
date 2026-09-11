import {
	ActivityCounts,
	DayActivityMap,
	DaysMap,
	PersistedBaselines,
	PersistedDaysMap,
	PersistedFileDict,
} from "@/defs/types";

/*
 * Stats codec — the ONLY module that knows about the split between the
 * persisted shape (dictionary-encoded maps in the stats data file) and
 * the store's runtime state (full file paths everywhere).
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
 */

// ─── File dictionary cache ───
let cachedFileDict: PersistedFileDict = {};
let cachedNextId = 0;
let lastDictSize = 0;

function setCachedFileDict(dict: PersistedFileDict): void {
	cachedFileDict = { ...dict };
	cachedNextId = Object.values(dict).reduce((m, v) => Math.max(m, v + 1), 0);
}

// ─── Encoded days cache ───
// Keystrokes only change today's row, so we cache the fully-encoded `days`
// snapshot keyed by (today, historicalVersion).  On cache hit we skip
// re-scanning the history and only update `today` in place.  On cache miss
// we rebuild the entire encoded snapshot.
let cachedEncToday = "";
let cachedEncHistVer = -1;
let cachedEncodedDays: PersistedDaysMap = {};

/**
 * Reset all module-level codec caches (file dict + encoded days snapshot).
 * Called on plugin unload so stale state can't leak into the next load cycle.
 */
export function resetStatsCodecCache(): void {
	cachedFileDict = {};
	cachedNextId = 0;
	lastDictSize = 0;
	cachedEncToday = "";
	cachedEncHistVer = -1;
	cachedEncodedDays = {};
}

export interface DecodedActivities {
	days: DaysMap;
	todayBaselines: DayActivityMap;
	todayBaselinesDay: string | null;
	activeFiles: Set<string>;
}

type StatsInput =
	| {
			days?: PersistedDaysMap;
			fileDict?: PersistedFileDict;
			todayBaselines?: PersistedBaselines;
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

/**
 * Collect every filePath that appears in any day map.
 * Used to seed the activeFiles set at load time.
 */
export function collectActiveFiles(days: DaysMap): Set<string> {
	return new Set(Object.values(days).flatMap((d) => Object.keys(d)));
}

function encodeDayMap(
	day: DayActivityMap,
): Record<string, ActivityCounts> {
	const encoded: Record<string, ActivityCounts> = {};
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
	encoded: Record<string, ActivityCounts>,
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
 * a new auto-incremented ID to any path not yet in the dictionary (via
 * module-level `cachedNextId`).
 * Returns the encoded map (empty when the day had no nonzero rows).
 */
function encodeDay(
	day: DayActivityMap,
): Record<string, ActivityCounts> {
	const kept: DayActivityMap = {};
	for (const [filePath, added] of Object.entries(day)) {
		if (added.w !== 0 || added.c !== 0) {
			kept[filePath] = added;
			if (!(filePath in cachedFileDict)) {
				cachedFileDict[filePath] = cachedNextId++;
			}
		}
	}
	return kept ? encodeDayMap(kept) : {};
}

// Baselines survive for the whole day once set, even when a file's row
// drops to 0 (editor back at baseline): pruning them would re-anchor the
// baseline to disk content on the next keystroke — a silent baseline
// rollback after deletions.  The map is day-scoped (cleared on midnight
// rollover), so nothing lingers into the next day.
function encodeBaselines(
	todayBaselinesDay: string | null,
	todayBaselines: DayActivityMap,
	today: string,
): PersistedBaselines | undefined {
	if (todayBaselinesDay !== today) return undefined;
	if (Object.keys(todayBaselines).length === 0) return undefined;
	return { day: today, baselines: encodeDayMap(todayBaselines) };
}

/**
 * Ensure the cached encoded days snapshot is up to date with the current
 * (today, historicalVersion) key.  On cache hit, the snapshot is already
 * current — return true and do nothing.  On cache miss, rebuild the entire
 * encoded snapshot (all dates including today) and return false.
 *
 * The snapshot is stable across keystrokes — it only changes when today
 * rolls over, historical data is edited, or an external sync replaces
 * the data.
 */
function ensureEncodedDays(
	inputDays: DaysMap,
	today: string,
	historicalVersion: number,
): boolean {
	if (today === cachedEncToday && historicalVersion === cachedEncHistVer)
		return true;

	const encoded: PersistedDaysMap = {};
	for (const [date, day] of Object.entries(inputDays)) {
		const encDay = encodeDay(day);
		if (Object.keys(encDay).length > 0) encoded[date] = encDay;
	}
	cachedEncodedDays = encoded;
	cachedEncToday = today;
	cachedEncHistVer = historicalVersion;
	return false;
}

/**
 * Decode the persisted `days` into the store's path-keyed shape
 * (dictionary-encoded, fileDict present).
 */
function decodeDays(stats: StatsInput): DaysMap {
	if (!hasFileDict(stats)) return {};
	const idToPath = buildIdToPath(stats.fileDict);
	const days: DaysMap = {};
	for (const [date, encDay] of Object.entries(stats.days ?? {})) {
		days[date] = decodeDayMap(encDay, idToPath);
	}
	return days;
}

/**
 * Decode today's baselines (same dictionary encoding as `days`).
 */
function decodeBaselines(
	stats: StatsInput,
	today: string,
): { todayBaselines: DayActivityMap; todayBaselinesDay: string | null } {
	const persisted = stats?.todayBaselines;
	if (persisted?.day === today && persisted.baselines && hasFileDict(stats)) {
		return {
			todayBaselines: decodeDayMap(
				persisted.baselines,
				buildIdToPath(stats.fileDict),
			),
			todayBaselinesDay: today,
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
 * map plus the current-day baselines.
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
 * The encoded days snapshot is cached across saves (see `ensureEncodedDays`).
 * On cache hit, only today's row is updated in place — O(files today).
 * On cache miss, the full snapshot is rebuilt from scratch.
 */
export function encodePersistedStats({
	today,
	days,
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
	const cacheHit = ensureEncodedDays(days, today, historicalVersion);

	if (cacheHit) {
		// Cache hit: snapshot is current — only update today in place.
		const todayDay = days[today] ?? {};
		const encodedTodayDay = encodeDay(todayDay);
		if (Object.keys(encodedTodayDay).length > 0) {
			cachedEncodedDays[today] = encodedTodayDay;
		} else {
			delete cachedEncodedDays[today];
		}
	}

	const encodedBaselines = encodeBaselines(
		todayBaselinesDay,
		todayBaselines,
		today,
	);

	// Drop orphaned fileDict entries (left behind by file renames or deletions).
	if (Object.keys(cachedFileDict).length !== lastDictSize) {
		cachedFileDict = filterOrphanedFileDict(cachedEncodedDays, encodedBaselines);
	}
	lastDictSize = Object.keys(cachedFileDict).length;

	return {
		fileDict: cachedFileDict,
		days: cachedEncodedDays,
		...(encodedBaselines && { todayBaselines: encodedBaselines }),
	};
}
