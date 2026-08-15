import {
	ActivityRecord,
	DayActivityMap,
	TargetCount,
	CalculationType,
} from "@/defs/types";
import { useStore, KTRState } from "./store";
import {
	dayDiff,
	formatDate,
	getStartOfMonth,
	getMondayOfCurrentWeek,
	getStartOfYear,
	parseDate,
} from "@/utils/dateUtils";
import { getDailySummaryMap, getStreak } from "@/utils/dailySummaryCache";
import { getLanguageBasedWordCount } from "@/core/wordCounting";
import { getPlugin } from "@/core/pluginRegistry";
import { MarkdownView, TFile } from "obsidian";

/** Read the file's current word count (cachedRead with read fallback). */
export async function getWordCountForFile(file: TFile): Promise<number> {
	const plugin = getPlugin();
	let content = await plugin.app.vault.cachedRead(file);
	// cachedRead returns Promise<string> — never null per the type
	// signature, but it CAN return an empty string when the vault cache
	// hasn't been populated yet (e.g. a freshly created file or a stale
	// cache entry).  Fall back to the uncached read in that case too.
	if (!content) {
		content = await plugin.app.vault.read(file);
	}
	return getLanguageBasedWordCount(
		content,
		useStore.getState().settings.enabledLanguages,
	);
}

/**
 * Word count preferring the live editor buffer over disk: rewriting a
 * today baseline would otherwise race unsaved edits (the change event has
 * already fired), baking a permanent offset into the day's delta.  Falls
 * back to the cached disk read when the file isn't open anywhere.
 */
async function getCurrentWordCountLive(file: TFile): Promise<number> {
	const app = getPlugin().app;
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		if (
			leaf.view instanceof MarkdownView &&
			leaf.view.file?.path === file.path &&
			leaf.view.editor
		) {
			return getLanguageBasedWordCount(
				leaf.view.editor.getValue(),
				useStore.getState().settings.enabledLanguages,
			);
		}
	}
	return getWordCountForFile(file);
}

/** Version selectors for React components to subscribe to. */
export const selectTodayVersion = (s: KTRState) => s.todayVersion;
export const selectHistoricalVersion = (s: KTRState) => s.historicalVersion;

/* ─────────────────────────────────────────────────────────────────────────
 * Pure read helpers (array → value).
 *
 * ────────────────────────────────────────────────────────────────────── */

export function getActivityByDate(date: string): DayActivityMap {
	// One map for all dates — today's slice is just `days[today]`.
	return useStore.getState().days[date] ?? {};
}

/**
 * Object-shaped rows for a date (used by Entries rendering and anything
 * that needs the query-engine-facing ActivityRecord shape).
 */
export function getActivityRowsByDate(date: string): ActivityRecord[] {
	const day = getActivityByDate(date);
	return Object.entries(day).map(([filePath, wordsAdded]) => ({
		date,
		filePath,
		wordsAdded,
	}));
}

export function getActivityByDateAndFile(
	date: string,
	filePath: string,
): ActivityRecord | undefined {
	const day = getActivityByDate(date);
	if (day[filePath] === undefined) return undefined;
	return { date, filePath, wordsAdded: day[filePath] };
}

type PeriodRange = { startDate: string; totalDays: number };

let _rangeCache: {
	today: string;
	ranges: Partial<Record<TargetCount, PeriodRange>>;
} = { today: "", ranges: {} };

/**
 * Compute the inclusive date range [startDate, today] and elapsed days
 * for period-based targets. Returns null for non-period targets.
 *
 * Pure date arithmetic — no data reads. Results are cached per day: once a
 * target's dates are computed for a given today string, subsequent calls
 * are O(1) map lookups. Invalidated when today changes.
 */
function getPeriodRange(
	target: TargetCount,
): PeriodRange | null {
	const today = useStore.getState().today;

	if (_rangeCache.today !== today) {
		_rangeCache.today = today;
		_rangeCache.ranges = {};
	}

	const cached = _rangeCache.ranges[target];
	if (cached !== undefined) return cached;

	const todayDate = parseDate(today);
	let result: PeriodRange;

	switch (target) {
		case TargetCount.CURRENT_WEEK: {
			const start = getMondayOfCurrentWeek();
			result = {
				startDate: formatDate(start),
				totalDays: dayDiff(todayDate, start) + 1,
			};
			break;
		}
		case TargetCount.CURRENT_MONTH: {
			const start = getStartOfMonth(todayDate);
			result = {
				startDate: formatDate(start),
				totalDays: dayDiff(todayDate, start) + 1,
			};
			break;
		}
		case TargetCount.CURRENT_YEAR: {
			const start = getStartOfYear(todayDate);
			result = {
				startDate: formatDate(start),
				totalDays: dayDiff(todayDate, start) + 1,
			};
			break;
		}
		case TargetCount.LAST_WEEK: {
			const start = new Date(todayDate);
			start.setDate(start.getDate() - 7);
			result = { startDate: formatDate(start), totalDays: 7 };
			break;
		}
		case TargetCount.LAST_MONTH: {
			const start = new Date(todayDate);
			start.setDate(start.getDate() - 30);
			result = { startDate: formatDate(start), totalDays: 30 };
			break;
		}
		case TargetCount.LAST_YEAR: {
			const start = new Date(todayDate);
			start.setDate(start.getDate() - 365);
			result = { startDate: formatDate(start), totalDays: 365 };
			break;
		}
		default:
			return null;
	}

	_rangeCache.ranges[target] = result;
	return result;
}

let _sumCache: {
	today: string;
	historicalVersion: number;
	sums: Partial<Record<TargetCount, number>>;
} = { today: "", historicalVersion: -1, sums: {} };

/**
 * Sum words over a period target's full range [startDate, today].
 * Cached by (target, today, historicalVersion): the historical partition
 * doesn't change on keystrokes, so the O(days) walk (7 / 30 / 365) runs
 * only when today or historicalVersion changes; per keystroke the cached
 * total already includes the stable historical part, re-summed cheaply
 * with today's live overlay below.
 */
function getPeriodHistoricalSum(target: TargetCount): number {
	const { today, historicalVersion } = useStore.getState();

	if (
		_sumCache.today !== today ||
		_sumCache.historicalVersion !== historicalVersion
	) {
		_sumCache.today = today;
		_sumCache.historicalVersion = historicalVersion;
		_sumCache.sums = {};
	}

	const cached = _sumCache.sums[target];
	if (cached !== undefined) return cached;

	const range = getPeriodRange(target);
	if (!range) return 0;

	// Walk [startDate, today) across the historical partition once — today's
	// live row is untouched so keystrokes never re-enter this loop.
	const map = getDailySummaryMap();
	let sum = 0;
	const start = parseDate(range.startDate);
	const cursor = new Date(parseDate(today));
	cursor.setDate(cursor.getDate() - 1);
	while (cursor >= start) {
		sum += map[formatDate(cursor)] || 0;
		cursor.setDate(cursor.getDate() - 1);
	}

	_sumCache.sums[target] = sum;
	return sum;
}

/**
 * Resolve the count for the given target.  Reads everything it needs from
 * the store synchronously.  Uses the partitioned cache for O(1) lookups
 * instead of scanning the full dailyActivity array on every call.
 */
export function getCurrentCount(
	target: TargetCount,
	calc?: CalculationType,
): number {
	const { today } = useStore.getState();
	if (target === TargetCount.CURRENT_STREAK) {
		return getStreak();
	}
	if (target === TargetCount.CURRENT_DAY) {
		const map = getDailySummaryMap();
		return map[today] || 0;
	}
	if (target === TargetCount.LAST_DAY) {
		const map = getDailySummaryMap();
		const yesterdayDate = parseDate(today);
		yesterdayDate.setDate(yesterdayDate.getDate() - 1);
		const yesterday = formatDate(yesterdayDate);
		return (map[yesterday] || 0) + (map[today] || 0);
	}

	const range = getPeriodRange(target);
	if (!range) {
		console.error("Unsupported target type: " + target);
		return 0;
	}

	// getPeriodSum is cached across keystrokes (historical part is stable);
	// only today's live row is overlaid here, so typing stays O(1).
	const map = getDailySummaryMap();
	const value = getPeriodHistoricalSum(target) + (map[today] || 0);
	return calc === CalculationType.AVG
		? Math.round(value / range.totalDays)
		: value;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Write helpers — thin wrappers over store actions so existing call sites
 * (Entries.tsx) don't need to know about the store
 * internals.  All persist signaling is handled by the store actions.
 * ────────────────────────────────────────────────────────────────────── */

export async function getExistingOrCreateNewEntry(
	file: TFile,
	date: string,
): Promise<ActivityRecord> {
	const cur = useStore.getState();
	const entry = getActivityByDateAndFile(date, file.path);

	if (entry) {
		// Row exists but the live baseline was lost (e.g. stale external
		// merge or a restart that slept through midnight) — re-capture it.
		if (date === cur.today && cur.todayBaselines[file.path] === undefined) {
			cur.setBaseline(file.path, await getWordCountForFile(file));
		}
		return entry;
	}

	// The baseline is read from DISK on purpose — the editor snapshot is
	// unreliable at this moment: at active-leaf-change the view may still
	// hold the previously focused file's content (the new content loads
	// asynchronously), which would silently set a wrong baseline.  Disk
	// reads never race keystrokes either (typing only reaches disk on
	// save), so words typed right after focus still count as today's delta.
	const currentWordCount = await getWordCountForFile(file);
	// Baseline is set eagerly (so isFileLive is true and the first
	// keystroke short-circuits), but NO row is written: a bare file open
	// must not litter the day with a 0-word entry.  The row only appears
	// (lazily) when the first debounced sample computes a non-zero delta.
	if (date === cur.today && cur.todayBaselines[file.path] === undefined) {
		cur.setBaseline(file.path, currentWordCount);
	}
	return { date, filePath: file.path, wordsAdded: 0 };
}

/**
 * Remove the activity row for (date, filePath).
 */
export const deleteActivityFromDate = (
	filePath: string,
	date: string,
): void => {
	useStore.getState().deleteActivity(date, filePath);
};

/**
 * Add or update the activity row for (date, filePath), storing `wordAdded`
 * as the day's total for that file.  For today the baseline is always
 * recomputed (`currentCount - added`) so the manual value acts as the
 * anchor for live tracking — subsequent typing accumulates on top of it
 * instead of the live sampler silently overriding a lower manual value.
 * Historical dates need no baseline at all.
 */
export const addOrUpdateActivity = async (
	file: TFile,
	date: string,
	wordAdded: number,
): Promise<void> => {
	const cur = useStore.getState();

	if (date === cur.today) {
		const currentWordCount = await getCurrentWordCountLive(file);
		cur.setBaseline(file.path, Math.max(0, currentWordCount - wordAdded));
	}

	cur.upsertAdded(date, file.path, wordAdded);
};


/**
 * Drop the module-level period-range and period-sum caches.  Called on
 * plugin unload so stale entries can't leak into the next load cycle.
 * (Both would self-heal via the today / historicalVersion guards, but
 * resetting here keeps behaviour consistent with the other caches.)
 */
export function resetDataQueryCaches(): void {
	_rangeCache = { today: "", ranges: {} };
	_sumCache = { today: "", historicalVersion: -1, sums: {} };
}
