export enum Unit {
	WORD = "WORD",
	CHAR = "CHAR",
}

/**
 * The two counts tracked per (date, filePath): words added and characters
 * added that day.  Stored together so both the word and char views of any
 * day are available without a second scan.
 */
export interface ActivityCounts {
	w: number;
	c: number;
}

/**
 * Virtual activity row: the "object-shaped" view of a (date, filePath)
 * activity entry used by the UI and the codeblock query engine.  It is
 * never stored as-is; the persisted form is numeric maps (see
 * `DayActivityMap` / `PersistedBaselines` below) encoded by statsCodec.ts.
 */
export interface ActivityRecord {
	date: string;
	filePath: string;
	wordsAdded: number;
	charsAdded: number;
}

/**
 * One day's activity in memory/on disk: filePath -> counts added that day.
 */
export type DayActivityMap = Record<string, ActivityCounts>;

/**
 * All activity days keyed by date (docs: today included).  The date's map
 * is the same shape regardless of whether it is today or a past day —
 * nothing distinguishes "live" rows at the storage level; the live anchor
 * (starting word count) lives separately in `todayBaselines`.
 */
export type DaysMap = Record<string, DayActivityMap>;

/**
 * Dictionary-encoded variant of DayActivityMap used on disk only.
 * Keys are numeric string IDs (JSON object keys are always strings)
 * mapped to real file paths via PersistedFileDict.
 *
 *   persisted:  { "0": {"w":500,"c":2000}, "1": {"w":300,"c":1200}, ... }
 *   runtime:    { "Notes/a.md": {"w":500,"c":2000}, ... }
 */
export type PersistedDayActivityMap = Record<string, ActivityCounts>;

/** Dictionary-encoded variant of DaysMap used on disk only. */
export type PersistedDaysMap = Record<string, PersistedDayActivityMap>;

/**
 * On-disk file path → numeric ID mapping.  Object form so path→ID is
 * O(1) at encode time and merge-by-path during external sync is trivial.
 */
export type PersistedFileDict = Record<string, number>;

/**
 * Persisted baselines for the CURRENT day only (`stats.todayBaselines`).
 *
 * The baseline of a file is its word count at the first moment it was
 * touched today; live deltas are computed as `editorCount - baseline`.
 * Once a day rolls over the baselines become dead weight and are
 * discarded (`day` lets the loader detect a stale copy, e.g. when the
 * app slept through midnight).
 */
export interface PersistedBaselines {
	/** Date the baselines were recorded. */
	day: string;
	/** filePath -> initial word/char count of the file for that day. */
	baselines: Record<string, ActivityCounts>;
}

/**
 * Legacy row shape. Only read during migration to the `days` format.
 */
export interface LegacyActivityData {
	date: string;
	filePath: string;
	wordCountStart: number;
	wordsAdded: number;
}

export enum CalculationType {
	TOTAL = "TOTAL",
	AVG = "AVG",
}

export type Language =
	| "LATIN"
	| "CJK"
	| "JAPANESE"
	| "KOREAN"
	| "CYRILLIC"
	| "GREEK"
	| "ARABIC"
	| "HEBREW"
	| "INDIC"
	| "SOUTHEAST_ASIAN";

export interface IntensityConfig {
	low: number;
	medium: number;
	high: number;
}

export interface ColorConfig {
	0: string;
	1: string;
	2: string;
	3: string;
	4: string;
}

export interface ThemeColors {
	light: ColorConfig;
	dark: ColorConfig;
}

export enum TargetCount {
	CURRENT_STREAK = "CURRENT_STREAK",
	CURRENT_DAY = "CURRENT_DAY", // Add progress bar towards daily goal
	CURRENT_WEEK = "CURRENT_WEEK",
	CURRENT_MONTH = "CURRENT_MONTH",
	CURRENT_YEAR = "CURRENT_YEAR",
	LAST_DAY = "LAST_DAY",
	LAST_WEEK = "LAST_WEEK",
	LAST_MONTH = "LAST_MONTH",
	LAST_YEAR = "LAST_YEAR",
}

export enum HeatmapColorModes {
	STOPS = "stops",
	GRADUAL = "gradual",
	SOLID = "solid",
	LIQUID = "liquid",
}

export interface Settings {
	dailyWritingGoal: number;
	/** Default unit used when displaying counts (words or characters). */
	preferredUnit: Unit;
	/**
	 * Debounce delay for sampling editor content on keystroke, in seconds.
	 * After the user stops typing for this long, the current editor state
	 * is read and word deltas are computed.
	 */
	editorChangeSampleDelay: number;
	enabledLanguages: Language[]; // guides the definition of REGEXes for word counting
	/** Skip Obsidian comments (%% ... %%) when counting words/chars. */
	ignoreComments: boolean;
	/** Skip task lines (`- [ ] ...`) when counting words/chars. */
	ignoreTasks: boolean;
	/** Deleting a file won't subtract its words/chars from the daily total. */
	ignoreDeletedFiles: boolean;
	/**
	 * Optional list of folder path prefixes. When non-empty, only files whose
	 * path equals one of these prefixes or starts with `<prefix>/` are
	 * tracked. Leave empty to track the whole vault (default behaviour).
	 */
	trackedFolders: string[];
	startOfTheWeek: "MONDAY" | "SUNDAY"; // not used yet, should be used to offset start of the week calculations and heatmap
	heatmapConfig: HeatmapConfig;
	heatmapNavigation: boolean;

	backupConfig: {
		enabled: boolean;
		maxNumberOfBackups: number;
		folderPath: string;
	};

	statusBar: {
		enabled: boolean;
	};

	sidebarConfig: {
		visibility: {
			showSlots: boolean;
			showHeatmap: boolean;
			showEntries: boolean;
		};
		slots: SlotConfig[];
	};
}

export interface SlotConfig {
	index: number;
	option: TargetCount;
	unit: Unit;
	calc: CalculationType;
}

export interface PluginData {
	settings: Settings;
	migratedPreviousVersion?: boolean;
	schema?: string;
	stats?: {
		/**
		 * Path → numeric ID dictionary for the dictionary-encoded `days`
		 * format.  Present (and valid) only when `days` uses numeric
		 * keys; absent in the legacy plain-path format.
		 */
		fileDict?: PersistedFileDict;
		/**
		 * date → filePath → words added that day. Includes the current
		 * day; yesterday-and-older rows only carry the added count (the
		 * per-file wordCountStart lives exclusively in `todayBaselines`).
		 *
		 * On disk this may be dictionary-encoded (keys are numeric IDs,
		 * with `fileDict` providing the path mapping).  At runtime it is
		 * always expanded to full paths — the decode step in statsCodec
		 * handles both shapes transparently.
		 */
		days?: Record<string, DayActivityMap> | PersistedDaysMap;
		/** Baselines for today's live files (see PersistedBaselines).
		 *  Same dictionary-encoding rule as `days`: keys are numeric IDs
		 *  when `fileDict` is present, file paths otherwise. */
		todayBaselines?: PersistedBaselines;
		/** Legacy v1.x storage — migrated into `days` on load. */
		dailyActivity?: LegacyActivityData[];
	};
}


export interface HeatmapConfig {
	/** Unit displayed by the heatmap (defaults to preferredUnit). */
	unit?: Unit;
	numberOfWeeks?: number;
	cellSize?: number;
	intensityMode: HeatmapColorModes;
	roundCells: boolean;
	hideMonthLabels: boolean;
	hideWeekdayLabels: boolean;
	alignLeft: boolean;
	startDate?: string;
	intensityStops: {
		low: number;
		medium: number;
		high: number;
	};
	colors?: {
		light: ColorConfig;
		dark: ColorConfig;
	};
}
export const DEFAULT_SETTINGS: Settings = {
	enabledLanguages: ["LATIN"],
	dailyWritingGoal: 500,
	preferredUnit: Unit.WORD,
	editorChangeSampleDelay: 2,
	ignoreComments: false,
	ignoreTasks: false,
	ignoreDeletedFiles: false,
	trackedFolders: [],
	startOfTheWeek: "SUNDAY",
	heatmapNavigation: true,
	heatmapConfig: {
		roundCells: true,
		hideMonthLabels: false,
		hideWeekdayLabels: false,
		alignLeft: false,
		numberOfWeeks: 52,
		cellSize: 10,
		intensityMode: HeatmapColorModes.GRADUAL,
		intensityStops: {
			low: 100,
			medium: 500,
			high: 1000,
		},
		colors: {
			light: {
				0: "#e0e0e0",
				1: "#9be9a8",
				2: "#6ad286",
				3: "#2ebd54",
				4: "#12a53e",
			},
			dark: {
				0: "#ebedf015",
				1: "#0e4429",
				2: "#006d32",
				3: "#26a641",
				4: "#39d353",
			},
		},
	},
	sidebarConfig: {
		visibility: {
			showSlots: true,
			showEntries: true,
			showHeatmap: true,
		},
		slots: [
			{
				index: 0,
				option: TargetCount.CURRENT_DAY,
				unit: Unit.WORD,
				calc: CalculationType.TOTAL,
			},
			{
				index: 1,
				option: TargetCount.CURRENT_WEEK,
				unit: Unit.WORD,
				calc: CalculationType.TOTAL,
			},
			{
				index: 2,
				option: TargetCount.LAST_MONTH,
				unit: Unit.WORD,
				calc: CalculationType.AVG,
			},
		],
	},
	backupConfig: {
		enabled: true,
		folderPath: ".keep-the-rhythm2",
		maxNumberOfBackups: 7,
	},
	statusBar: {
		enabled: true,
	},
};

/**
 * Backfill settings loaded from disk (which may predate newer fields) with
 * the current defaults.  A shallow spread is enough for scalar settings;
 * the nested `slots` array is normalized field-by-field so an older saved
 * slot without a `unit` still gets one.
 */
export function normalizeSettings(
	saved: Partial<Settings> | undefined,
): Settings {
	const merged: Settings = { ...DEFAULT_SETTINGS, ...saved };

	if (saved?.heatmapConfig) {
		merged.heatmapConfig = {
			...DEFAULT_SETTINGS.heatmapConfig,
			...saved.heatmapConfig,
			intensityStops: {
				...DEFAULT_SETTINGS.heatmapConfig.intensityStops,
				...(saved.heatmapConfig.intensityStops ?? {}),
			},
			colors:
				saved.heatmapConfig.colors ??
				DEFAULT_SETTINGS.heatmapConfig.colors,
		};
	}

	if (saved?.sidebarConfig) {
		merged.sidebarConfig = {
			...DEFAULT_SETTINGS.sidebarConfig,
			...saved.sidebarConfig,
			visibility: {
				...DEFAULT_SETTINGS.sidebarConfig.visibility,
				...saved.sidebarConfig.visibility,
			},
		};
		merged.sidebarConfig.slots = (saved.sidebarConfig.slots ?? []).map(
			(slot, index) => ({
				...DEFAULT_SETTINGS.sidebarConfig.slots[0],
				...slot,
				unit: slot.unit ?? DEFAULT_SETTINGS.preferredUnit,
				index,
			}),
		);
	}

	if (saved?.backupConfig) {
		merged.backupConfig = {
			...DEFAULT_SETTINGS.backupConfig,
			...saved.backupConfig,
		};
	}

	if (saved?.statusBar) {
		merged.statusBar = { ...DEFAULT_SETTINGS.statusBar, ...saved.statusBar };
	}

	return merged;
}
