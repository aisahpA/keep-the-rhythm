import React, { useMemo } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { weekdaysNames, monthNames } from "../texts";
import { getDateForCell, formatDate, getToday } from "@/utils/dateUtils";
import { ActivityRecord, DayActivityMap } from "@/defs/types";
import { HeatmapColorModes, HeatmapConfig } from "@/defs/types";
import { HeatmapCell } from "./HeatmapCell";
import { compileEvaluator } from "@/core/codeBlockQuery";
import { useStore } from "@/core/store";
import { selectTodayVersion, selectHistoricalVersion } from "@/core/dataQueries";
import { getDailySummaryMap } from "@/utils/dailySummaryCache";
import { moment as _moment } from "obsidian";
const moment = _moment as unknown as typeof _moment.default;

interface HeatmapProps {
	heatmapConfig: HeatmapConfig;
	fileFilter?: any;
	isCodeBlock?: boolean;
}

export const Heatmap = ({
	heatmapConfig,
	fileFilter,
	isCodeBlock,
}: HeatmapProps) => {
	// ── Destructure config ──────────────────────────────────────
	const weeksToShow = heatmapConfig.numberOfWeeks || 52;
	const startDate = heatmapConfig.startDate;
	const {
		intensityMode,
		roundCells,
		intensityStops,
		hideMonthLabels,
		hideWeekdayLabels,
		alignLeft,
	} = heatmapConfig;

	const baseDate = startDate ? new Date(startDate) : undefined;

	// Grid shape key: tracks weeks + baseDate (or today when no startDate).
	const gridKey = startDate
		? `${weeksToShow}:${startDate}`
		: `${weeksToShow}:${getToday()}`;

	const today = getToday();
	const todayVersion = useStore(selectTodayVersion);
	const historicalVersion = useStore(selectHistoricalVersion);

	// ── Filter state ────────────────────────────────────────────
	const filterState = useMemo(() => {
		if (!fileFilter) return null;
		if (
			fileFilter.type === "BinaryExpression" &&
			(fileFilter.operator === "starts_with" || fileFilter.operator === "STARTS_WITH")
		) {
			const raw = fileFilter.right?.value;
			if (typeof raw === "string") {
				const prefix = raw.startsWith("/") ? raw.slice(1) : raw;
				return { kind: "prefix" as const, prefix };
			}
		}
		try {
			const evaluator = compileEvaluator(fileFilter);
			return { kind: "evaluator" as const, evaluator };
		} catch {
			return null;
		}
	}, [fileFilter]);

	// ── Cell dates for the visible grid ─────────────────────────
	const cellDates = useMemo(() => {
		const dates: string[] = [];
		for (let week = 0; week < weeksToShow; week++) {
			for (let day = 0; day < 7; day++) {
				dates.push(formatDate(getDateForCell(week, day, weeksToShow, baseDate)));
			}
		}
		return dates;
	}, [gridKey]);

	// ── Historical data (non-today cells) ──────────────────────
	// Cached by (historicalVersion, grid, filter) — never invalidated by
	// todayVersion, so typing today never re-walks historical rows.
	const historicalCellData = useMemo(() => {
		return buildCellData(cellDates, today, filterState);
	}, [historicalVersion, gridKey, cellDates, today, filterState]);

	// ── Today's live cell ──────────────────────────────────────
	// Re-read on every keystroke (todayVersion).
	const todayCellData = useMemo(() => {
		if (!filterState) {
			const fullMap = getDailySummaryMap();
			return fullMap[today] ?? 0;
		}
		const { days } = useStore.getState();
		const day = days[today];
		if (!day) return 0;
		const map: Record<string, number> = {};
		applyFilter(today, day, filterState, map);
		return map[today] ?? 0;
	}, [todayVersion, today, filterState]);

	// ── Intensity ──────────────────────────────────────────────
	const intensityResolver = useMemo(
		() => buildIntensityResolver(intensityMode, intensityStops),
		[intensityMode, intensityStops],
	);

	// ── Month labels ───────────────────────────────────────────
	const monthLabels = useMemo(() => {
		const labels: { month: string; week: number }[] = [];
		let lastMonth = -1;
		for (let week = 0; week < weeksToShow; week++) {
			const m = moment(getDateForCell(week, 0, weeksToShow, baseDate));
			const month = m.month();
			if (month !== lastMonth && m.date() <= 7) {
				labels.push({ month: monthNames[month], week });
				lastMonth = month;
			}
		}
		return labels;
	}, [weeksToShow, baseDate]);

	const squared = !roundCells;

	// ── Pre-render historical cells, split at today's position ─
	const { before, after, hasToday } = useMemo(() => {
		const before: React.ReactNode[] = [];
		const after: React.ReactNode[] = [];
		let hasToday = false;
		for (const date of cellDates) {
			if (date === today) {
				hasToday = true;
				continue;
			}
			const count = historicalCellData[date] ?? 0;
			(hasToday ? after : before).push(
				<HeatmapCell
					key={date}
					count={count}
					date={date}
					squared={squared}
					intensity={intensityResolver(count)}
					mode={intensityMode}
					isToday={false}
				/>,
			);
		}
		return { before, after, hasToday };
	}, [cellDates, historicalCellData, intensityResolver, squared, intensityMode, today]);

	const todayCell = useMemo(() => {
		if (!hasToday) return null;
		return (
			<HeatmapCell
				key={today}
				count={todayCellData}
				date={today}
				squared={squared}
				intensity={intensityResolver(todayCellData)}
				mode={intensityMode}
				isToday
			/>
		);
	}, [hasToday, today, todayCellData, squared, intensityResolver, intensityMode]);

	const wrapperClasses = useMemo(
		() =>
			`heatmap-wrapper
    ${hideWeekdayLabels ? "hide-weekday-labels" : ""}
    ${hideMonthLabels ? "hide-month-labels" : ""}
    ${alignLeft ? "align-left" : ""}
    ${isCodeBlock ? "is-code-block-heatmap" : ""}`.trim(),
		[hideWeekdayLabels, hideMonthLabels, alignLeft, isCodeBlock],
	);

	const gridCols = `repeat(${weeksToShow}, 10px)`;
	const gridRows = `repeat(7, 10px)`;

	return (
		<RadixTooltip.Provider
			delayDuration={0}
			skipDelayDuration={1000}
			disableHoverableContent
		>
			{historicalCellData && (
				<div className={wrapperClasses}>
					{!hideWeekdayLabels && (
						<div className="week-day-labels">
							{weekdaysNames.map((day) => (
								<div key={day} className="week-day-label">{day}</div>
							))}
						</div>
					)}
					<div className="heatmap-content">
						{!hideMonthLabels && (
							<div
								className="month-labels"
								style={{ gridTemplateColumns: gridCols }}
							>
								{monthLabels.map(({ month, week }) => (
									<div
										key={`${month}-${week}`}
										className="month-label"
										style={{ gridColumn: week }}
									>
										{month}
									</div>
								))}
							</div>
						)}
						<div
							className="heatmap-new-grid"
							style={{
								gridTemplateColumns: gridCols,
								gridTemplateRows: gridRows,
							}}
						>
							{before}
							{hasToday && todayCell}
							{after}
						</div>
					</div>
				</div>
			)}
		</RadixTooltip.Provider>
	);
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

interface PrefixFilter {
	kind: "prefix";
	prefix: string;
}

interface EvaluatorFilter {
	kind: "evaluator";
	evaluator: (row: ActivityRecord) => boolean;
}

type FilterState = PrefixFilter | EvaluatorFilter | null;

/**
 * Build the full cell data map for all `cellDates`, excluding `today`.
 */
function buildCellData(
	cellDates: string[],
	today: string,
	filter: FilterState,
): Record<string, number> {
	const map: Record<string, number> = {};

	if (!filter) {
		const fullMap = getDailySummaryMap();
		for (const date of cellDates) {
			if (date === today) continue;
			map[date] = fullMap[date] ?? 0;
		}
	} else {
		const { days } = useStore.getState();
		for (const date of cellDates) {
			if (date === today) continue;
			const day = days[date];
			if (day) applyFilter(date, day, filter, map);
		}
	}

	return map;
}

function applyFilter(
	date: string,
	day: DayActivityMap,
	filter: Exclude<FilterState, null>,
	map: Record<string, number>,
): void {
	for (const [filePath, wordsAdded] of Object.entries(day)) {
		const matches =
			filter.kind === "prefix"
				? filePath.startsWith(filter.prefix)
				: filter.evaluator({ date, filePath, wordsAdded });
		if (matches) {
			map[date] = (map[date] ?? 0) + wordsAdded;
		}
	}
}

function buildIntensityResolver(
	mode: HeatmapConfig["intensityMode"],
	stops: { low: number; medium: number; high: number },
): (count: number) => number {
	if (!stops) return () => 0;

	const { low, medium, high } = stops;

	switch (mode) {
		case HeatmapColorModes.GRADUAL:
		case HeatmapColorModes.LIQUID:
			if (high === low) return (c) => (c >= high ? 100 : 0);
			const span = high - low;
			return (c) => {
				if (c <= low) return 0;
				if (c >= high) return 100;
				return ((c - low) / span) * 100;
			};

		case HeatmapColorModes.SOLID:
			return (c) => (c >= low ? 4 : 0);

		case HeatmapColorModes.STOPS: {
			const sorted = [low, medium, high].sort((a, b) => a - b);
			const [t1, t2, t3] = sorted;
			return (c) => {
				if (c <= 0) return 0;
				if (c < t1) return 1;
				if (c < t2) return 2;
				if (c < t3) return 3;
				return 4;
			};
		}

		default:
			return () => 0;
	}
}