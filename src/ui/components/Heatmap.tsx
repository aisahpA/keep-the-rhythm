import React from "react";
import { useMemo } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { weekdaysNames, monthNames } from "../texts";
import { getDateForCell } from "@/utils/dateUtils";
import { formatDate, getToday } from "@/utils/dateUtils";
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
	query?: any;
	isCodeBlock?: boolean;
}

export const Heatmap = ({
	heatmapConfig,
	query,
	isCodeBlock,
}: HeatmapProps) => {
	const weeksToShow = heatmapConfig.numberOfWeeks || 52;
	const baseDate = heatmapConfig.startDate
		? new Date(heatmapConfig.startDate)
		: undefined;
	const baseDateKey = heatmapConfig.startDate ?? null;

	// Primitive key for the grid shape. When no startDate is given,
	// getDateForCell reads the current week, so the key must also track today.
	const gridKey = baseDateKey ? `${weeksToShow}:${baseDateKey}` : `${weeksToShow}:${getToday()}`;

	const today = getToday();

	const todayVersion = useStore(selectTodayVersion);
	const historicalVersion = useStore(selectHistoricalVersion);
	
	const compiledEvaluator = useMemo(() => {
		if (!query) return null;
		try {
			return compileEvaluator(query);
		} catch (e) {
			console.error("Error compiling query:", e);
			return null;
		}
	}, [query]);

	const isFilterActive =
		(query?.type === "BinaryExpression" &&
			(query?.operator === "starts_with" ||
				query?.operator === "STARTS_WITH")) ||
		compiledEvaluator;

	const isStartsWith =
		query?.type === "BinaryExpression" &&
		(query?.operator === "starts_with" ||
			query?.operator === "STARTS_WITH");
	const prefix =
		isStartsWith && typeof query?.right?.value === "string"
			? query.right.value.startsWith("/")
				? query.right.value.substring(1)
				: query.right.value
			: null;

	const cellDates = useMemo(() => {
		const dates: string[] = [];
		for (let week = 0; week < weeksToShow; week++) {
			for (let day = 0; day < 7; day++) {
				const date = getDateForCell(week, day, weeksToShow, baseDate);
				dates.push(formatDate(date));
			}
		}
		return dates;
	}, [gridKey]);

	// No-filter path: split into two tiers so that keystrokes
	// (todayVersion changes) only re-read today's cell:
	//   • unfilteredBaseData — all non-today cells; cached by
	//     (historicalVersion, grid) — NOT todayVersion.
	//   • unfilteredTodayData — today's cell only; re-read each keystroke.
	// This is the hot path for the sidebar heatmap and must not invalidate
	// the historical base on every keystroke.
	const unfilteredBaseData = useMemo(() => {
		const fullMap = getDailySummaryMap();
		const map: Record<string, number> = {};
		for (const date of cellDates) {
			if (date === today) continue;
			map[date] = fullMap[date] || 0;
		}
		return map;
	}, [historicalVersion, gridKey, cellDates, today]);

	const unfilteredTodayData = useMemo(() => {
		const fullMap = getDailySummaryMap();
		return fullMap[today] || 0;
	}, [todayVersion, today]);

	// Filtered path: iterate ONLY the days inside the visible grid
	// (cellDates), never the full history.  Split into two tiers so that
	// keystrokes (todayVersion changes) only re-scan today's row:
	//   • filteredBaseData — every non-today cell; cached by
	//     (historicalVersion, grid, query) — NOT todayVersion, so typing
	//     today never re-walks historical rows.
	//   • filteredTodayData — today's cell only; re-scanned each keystroke.
	const filteredBaseData = useMemo(() => {
		if (!isFilterActive) return null;
		const { days } = useStore.getState();
		const dateMap: Record<string, number> = {};
		for (const date of cellDates) {
			if (date === today) continue;
			const day = days[date];
			if (day) filterDayInto(date, day, prefix, compiledEvaluator, dateMap);
		}
		return dateMap;
	}, [isFilterActive, today, historicalVersion, prefix, compiledEvaluator,
		cellDates,
	]);

	const filteredTodayData = useMemo(() => {
		if (!isFilterActive) return null;
		const { days } = useStore.getState();
		const dateMap: Record<string, number> = {};
		const day = days[today];
		if (day) filterDayInto(today, day, prefix, compiledEvaluator, dateMap);
		return dateMap;
	}, [isFilterActive, today, todayVersion, prefix, compiledEvaluator]);

	// Base map for the grid — kept stable across keystrokes:
	//   • no-filter → unfilteredBaseData (rebuilt only on historicalVersion /
	//     grid changes; excludes today)
	//   • filtered  → filteredBaseData (same behavior)
	// Today's live cell is overlaid separately inside `cellData`:
	//   • no-filter → unfilteredTodayData
	//   • filtered  → filteredTodayData
	const baseCellData = isFilterActive ? filteredBaseData : unfilteredBaseData;

	const intensityResolver = useMemo(
		() => buildIntensityResolver(heatmapConfig),
		[heatmapConfig],
	);

	const monthLabels = useMemo(() => {
		const labels: { month: string; week: number }[] = [];
		let lastMonth = -1;

		for (let week = 0; week < weeksToShow; week++) {
			const date = getDateForCell(week, 0, weeksToShow, baseDate);
			const m = moment(date);
			const month = m.month();
			const dayOfMonth = m.date();

			if (month !== lastMonth && dayOfMonth <= 7) {
				labels.push({ month: monthNames[month], week });
				lastMonth = month;
			}
		}

		return labels;
	}, [weeksToShow, baseDateKey]);

	
	// Base grid cells (all NON-today dates) pre-rendered as stable React
	// elements, split into [before-today, after-today] so today's cell
	// (which sits in the MIDDLE of the grid — the current week's future
	// days follow it) can be inserted at the correct position.  Rebuilt
	// only when the historical partition, grid shape, or intensity config
	// changes — never on keystrokes.  Because the element references are
	// stable, React skips re-reconciling the ~363 historical cells on every
	// data change; only today's cell is recreated.
	const baseCells = useMemo(() => {
		const before: React.ReactNode[] = [];
		const after: React.ReactNode[] = [];
		let hasToday = false;
		const squared = !heatmapConfig.roundCells;
		const mode = heatmapConfig.intensityMode;
		for (const dateStr of cellDates) {
			if (dateStr === today) {
				hasToday = true;
				continue;
			}
			const count = baseCellData?.[dateStr] ?? 0;
			const cell = (
				<HeatmapCell
					key={dateStr}
					count={count}
					date={dateStr}
					squared={squared}
					intensity={intensityResolver(count)}
					mode={mode}
					isToday={false}
				/>
			);
			(hasToday ? after : before).push(cell);
		}
		return { before, after, hasToday };
	}, [
		cellDates,
		baseCellData,
		intensityResolver,
		heatmapConfig.roundCells,
		heatmapConfig.intensityMode,
		today,
	]);

	// Today's live cell — the ONLY element rebuilt per data change
	// (debounced sample).  Inserted between the two stable base segments to
	// preserve grid order.
	const todayCell = useMemo(() => {
		if (!baseCells.hasToday) return null;
		const count = isFilterActive
			? (filteredTodayData?.[today] ?? 0)
			: unfilteredTodayData;
		return (
			<HeatmapCell
				key={today}
				count={count}
				date={today}
				squared={!heatmapConfig.roundCells}
				intensity={intensityResolver(count)}
				mode={heatmapConfig.intensityMode}
				isToday
			/>
		);
	}, [
		baseCells.hasToday,
		today,
		isFilterActive,
		filteredTodayData,
		unfilteredTodayData,
		intensityResolver,
		heatmapConfig.roundCells,
		heatmapConfig.intensityMode,
	]);

	const wrapperClasses = useMemo(
		() =>
			`
		heatmap-wrapper
		${heatmapConfig.hideWeekdayLabels ? "hide-weekday-labels" : ""}
		${heatmapConfig.hideMonthLabels ? "hide-month-labels" : ""}
		${heatmapConfig.alignLeft ? "align-left" : ""}
		${isCodeBlock ? "is-code-block-heatmap" : ""}
		`.trim(),
		[heatmapConfig, isCodeBlock],
	);

	return (
		<RadixTooltip.Provider
			delayDuration={0}
			skipDelayDuration={1000}
			disableHoverableContent
		>
			{baseCellData && (
				<div className={wrapperClasses}>
					{!heatmapConfig.hideWeekdayLabels && (
						<div className="week-day-labels">
							{weekdaysNames.map((day) => (
								<div key={day} className="week-day-label">
									{day}
								</div>
							))}
						</div>
					)}
					<div className="heatmap-content">
						{!heatmapConfig.hideMonthLabels && (
							<div
								className="month-labels"
								style={{
									gridTemplateColumns: `repeat(${weeksToShow}, 10px)`,
								}}
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
								gridTemplateColumns: `repeat(${weeksToShow}, 10px)`,
								gridTemplateRows: `repeat(7, 10px)`,
							}}
						>
							{baseCells.before}
							{baseCells.hasToday && todayCell}
							{baseCells.after}
						</div>
					</div>
				</div>
			)}
		</RadixTooltip.Provider>
	);
};

const buildIntensityResolver = (
	heatmapConfig: HeatmapConfig,
): ((count: number) => number) => {
	if (
		!heatmapConfig ||
		!heatmapConfig.intensityStops ||
		!heatmapConfig.intensityMode
	) {
		return () => 0;
	}

	const { low, medium, high } = heatmapConfig.intensityStops;
	const mode = heatmapConfig.intensityMode;

	switch (mode) {
		case HeatmapColorModes.GRADUAL:
		case HeatmapColorModes.LIQUID: {
			if (high === low) {
				return (count) => (count >= high ? 100 : 0);
			}
			const span = high - low;
			return (count) => {
				if (count <= low) return 0;
				if (count >= high) return 100;
				return ((count - low) / span) * 100;
			};
		}

		case HeatmapColorModes.SOLID:
			return (count) => (count >= low ? 4 : 0);

		case HeatmapColorModes.STOPS: {
			const sorted = [low, medium, high].sort((a, b) => a - b);
			const [minThreshold, midThreshold, maxThreshold] = sorted;
			return (count) => {
				if (count <= 0) return 0;
				if (count < minThreshold) return 1;
				if (count < midThreshold) return 2;
				if (count < maxThreshold) return 3;
				return 4;
			};
		}

		default:
			return () => 0;
	}
};

/**
 * Accumulate matching rows from a single day into `dateMap` using the
 * resolved filter (a starts_with prefix or a compiled evaluator).
 */
function filterDayInto(
	date: string,
	day: DayActivityMap,
	prefix: string | null,
	evaluator: ((row: ActivityRecord) => boolean) | null,
	dateMap: Record<string, number>,
): void {
	for (const [filePath, wordsAdded] of Object.entries(day)) {
		let matches: boolean;
		if (prefix !== null) {
			matches = filePath.startsWith(prefix);
		} else if (evaluator) {
			matches = evaluator({ date, filePath, wordsAdded });
		} else {
			matches = true;
		}
		if (matches) {
			dateMap[date] = (dateMap[date] || 0) + wordsAdded;
		}
	}
}
