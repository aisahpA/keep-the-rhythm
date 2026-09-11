import React, { useMemo } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { weekdaysNames, monthNames } from "../texts";
import { getDateForCell, formatDate, getToday } from "@/utils/dateUtils";
import { ActivityRecord, DayActivityMap } from "@/defs/types";
import { HeatmapColorModes, HeatmapConfig } from "@/defs/types";
import { HeatmapCell } from "./HeatmapCell";
import { compileEvaluator, FilterNode } from "@/core/codeBlockQuery";
import { useStore } from "@/core/store";
import { selectTodayVersion, selectHistoricalVersion, countByUnit } from "@/core/dataQueries";
import { getDailySummaryMap } from "@/utils/dailySummaryCache";
import { Unit } from "@/defs/types";
import { setIcon } from "obsidian";
import { moment as _moment } from "obsidian";
const moment = _moment as unknown as typeof _moment.default;

interface HeatmapProps {
	heatmapConfig: HeatmapConfig;
	preferredUnit?: Unit;
	fileFilter?: unknown;
	isCodeBlock?: boolean;
	onCellClick?: (date: string) => void;
	selectedDate?: string;
}

export const Heatmap = ({
	heatmapConfig,
	preferredUnit = Unit.WORD,
	fileFilter,
	isCodeBlock,
	onCellClick,
	selectedDate,
}: HeatmapProps) => {
	// ── Destructure config ──────────────────────────────────────
	const weeksToShow = heatmapConfig.numberOfWeeks || 52;
	const cellSizePx = heatmapConfig.cellSize || 10;
	const startDate = heatmapConfig.startDate;
	const {
		intensityMode,
		roundCells,
		intensityStops,
		hideMonthLabels,
		hideWeekdayLabels,
		alignLeft,
	} = heatmapConfig;

	// Unit displayed by the heatmap: heatmapConfig.unit overrides the
	// preferred unit passed from the sidebar; both fall back to WORD.
	const [unit, setUnit] = React.useState<Unit>(
		heatmapConfig.unit ?? preferredUnit,
	);
	React.useEffect(() => {
		setUnit(heatmapConfig.unit ?? preferredUnit);
	}, [heatmapConfig.unit, preferredUnit]);

	// Hover states for highlighting heatmap areas by month/weekday label.
	const [hoveredMonth, setHoveredMonth] = React.useState<number | null>(null);
	const [hoveredWeekday, setHoveredWeekday] = React.useState<number | null>(
		null,
	);

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
		const filter = fileFilter as FilterNode | null | undefined;
		if (!filter) return null;
		if (
			filter.type === "BinaryExpression" &&
			(filter.operator === "starts_with" ||
				filter.operator === "STARTS_WITH")
		) {
			const raw = filter.right?.value;
			if (typeof raw === "string") {
				const prefix = raw.startsWith("/") ? raw.slice(1) : raw;
				return { kind: "prefix" as const, prefix };
			}
		}
		try {
			const evaluator = compileEvaluator(filter);
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
	// Cached by (historicalVersion, grid, filter, unit) — never invalidated
	// by todayVersion, so typing today never re-walks historical rows.
	const historicalCellData = useMemo(() => {
		return buildCellData(cellDates, today, filterState, unit);
	}, [historicalVersion, gridKey, cellDates, today, filterState, unit]);

	// ── Today's live cell ──────────────────────────────────────
	// Re-read on every keystroke (todayVersion).
	const todayCellData = useMemo(() => {
		if (!filterState) {
			const fullMap = getDailySummaryMap();
			return countByUnit(fullMap[today] ?? { w: 0, c: 0 }, unit);
		}
		const { days } = useStore.getState();
		const day = days[today];
		if (!day) return 0;
		const map: Record<string, number> = {};
		applyFilter(today, day, filterState, map, unit);
		return map[today] ?? 0;
	}, [todayVersion, today, filterState, unit]);

	// ── Intensity ──────────────────────────────────────────────
	const intensityResolver = useMemo(
		() => buildIntensityResolver(intensityMode, intensityStops),
		[intensityMode, intensityStops],
	);

	// ── Month labels ───────────────────────────────────────────
	const monthLabels = useMemo(() => {
		const labels: {
			month: string;
			week: number;
			index: number;
			key: string;
		}[] = [];
		let lastMonth = -1;
		let index = 0;
		for (let week = 0; week < weeksToShow; week++) {
			const m = moment(getDateForCell(week, 0, weeksToShow, baseDate));
			const month = m.month();
			if (month !== lastMonth && m.date() <= 7) {
				labels.push({
					month: monthNames[month],
					week,
					index,
					key: m.format("YYYY-MM"),
				});
				lastMonth = month;
				index++;
			}
		}
		return labels;
	}, [weeksToShow, baseDate]);

	const squared = !roundCells;

	// Month label index per cell, resolved from each cell's real calendar
	// month (YYYY-MM) so partial months and boundary weeks highlight exactly.
	const cellMonthIndices = useMemo(() => {
		const indexByMonth = new Map(monthLabels.map((l) => [l.key, l.index]));
		return cellDates.map((date) => indexByMonth.get(date.slice(0, 7)) ?? -1);
	}, [cellDates, monthLabels]);

	// cellDates is built week-major (week * 7 + day), so array position
	// yields both indices for hover dimming.
	const dimmedFor = React.useCallback(
		(index: number): boolean => {
			const day = index % 7;
			if (
				hoveredMonth !== null &&
				cellMonthIndices[index] !== hoveredMonth
			) {
				return true;
			}
			if (hoveredWeekday !== null && day !== hoveredWeekday) return true;
			return false;
		},
		[hoveredMonth, hoveredWeekday, cellMonthIndices],
	);

	// ── Pre-render historical cells, split at today's position ─
	const { before, after, hasToday, todayIndex } = useMemo(() => {
		const before: React.ReactNode[] = [];
		const after: React.ReactNode[] = [];
		let hasToday = false;
		let todayIndex = -1;
		cellDates.forEach((date, index) => {
			if (date === today) {
				hasToday = true;
				todayIndex = index;
				return;
			}
			const count = historicalCellData[date] ?? 0;
			(hasToday ? after : before).push(
				<HeatmapCell
					key={date}
					count={count}
					unit={unit}
					date={date}
					squared={squared}
					cellSize={cellSizePx}
					intensity={intensityResolver(count)}
					mode={intensityMode}
					isToday={false}
					onCellClick={onCellClick}
					selected={date === selectedDate}
					dimmed={dimmedFor(index)}
				/>,
			);
		});
		return { before, after, hasToday, todayIndex };
	}, [cellDates, historicalCellData, intensityResolver, squared, intensityMode, today, onCellClick, selectedDate, cellSizePx, unit, dimmedFor]);

	const todayCell = useMemo(() => {
		if (!hasToday) return null;
		return (
			<HeatmapCell
				key={today}
				count={todayCellData}
				unit={unit}
				date={today}
				squared={squared}
				cellSize={cellSizePx}
				intensity={intensityResolver(todayCellData)}
				mode={intensityMode}
				isToday
				onCellClick={onCellClick}
				selected={today === selectedDate}
				dimmed={dimmedFor(todayIndex)}
			/>
		);
	}, [hasToday, today, todayCellData, squared, intensityResolver, intensityMode, onCellClick, selectedDate, cellSizePx, unit, dimmedFor, todayIndex]);

	const wrapperClasses = useMemo(
		() =>
			`heatmap-wrapper
    ${hideWeekdayLabels ? "hide-weekday-labels" : ""}
    ${hideMonthLabels ? "hide-month-labels" : ""}
    ${alignLeft ? "align-left" : ""}
    ${isCodeBlock ? "is-code-block-heatmap" : ""}`.trim(),
		[hideWeekdayLabels, hideMonthLabels, alignLeft, isCodeBlock],
	);

	const gridCols = `repeat(${weeksToShow}, ${cellSizePx}px)`;
	const gridRows = `repeat(7, ${cellSizePx}px)`;

	return (
		<RadixTooltip.Provider
			delayDuration={0}
			skipDelayDuration={1000}
			disableHoverableContent
		>
			{historicalCellData && (
				<div className="heatmap-container">
					{!isCodeBlock && (
						<button
							className="KTR-min-button heatmap-unit-toggle"
							aria-label="Change Unit"
							ref={(el) => {
								if (el && !el.dataset.iconSet) {
									setIcon(el, "case-sensitive");
									el.dataset.iconSet = "1";
								}
							}}
							onClick={() =>
								setUnit((previous) =>
									previous === Unit.WORD ? Unit.CHAR : Unit.WORD,
								)
							}
						/>
					)}
					<div
						className={wrapperClasses}
						style={
							{ "--cell-size": `${cellSizePx}px` } as React.CSSProperties
						}
					>
						{!hideWeekdayLabels && (
							<div className="week-day-labels">
								{weekdaysNames.map((day, dayIndex) => (
									<div
										key={day}
										className="week-day-label"
										onMouseEnter={() => setHoveredWeekday(dayIndex)}
										onMouseLeave={() => setHoveredWeekday(null)}
									>
										{day}
									</div>
								))}
							</div>
						)}
						<div className="heatmap-content">
							{!hideMonthLabels && (
								<div
									className="month-labels"
									style={{ gridTemplateColumns: gridCols }}
								>
									{monthLabels.map(({ month, week, index }) => (
										<div
											key={`${month}-${week}`}
											className="month-label"
											style={{ gridColumn: week }}
											onMouseEnter={() => setHoveredMonth(index)}
											onMouseLeave={() => setHoveredMonth(null)}
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
	unit: Unit,
): Record<string, number> {
	const map: Record<string, number> = {};

	if (!filter) {
		const fullMap = getDailySummaryMap();
		for (const date of cellDates) {
			if (date === today) continue;
			map[date] = countByUnit(fullMap[date] ?? { w: 0, c: 0 }, unit);
		}
	} else {
		const { days } = useStore.getState();
		for (const date of cellDates) {
			if (date === today) continue;
			const day = days[date];
			if (day) applyFilter(date, day, filter, map, unit);
		}
	}

	return map;
}

function applyFilter(
	date: string,
	day: DayActivityMap,
	filter: Exclude<FilterState, null>,
	map: Record<string, number>,
	unit: Unit,
): void {
	for (const [filePath, counts] of Object.entries(day)) {
		const matches =
			filter.kind === "prefix"
				? filePath.startsWith(filter.prefix)
				: filter.evaluator({
						date,
						filePath,
						wordsAdded: counts.w,
						charsAdded: counts.c,
					});
		if (matches) {
			map[date] = (map[date] ?? 0) + countByUnit(counts, unit);
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
		case HeatmapColorModes.LIQUID: {
			if (high === low) return (c) => (c >= high ? 100 : 0);
			const span = high - low;
			return (c) => {
				if (c <= low) return 0;
				if (c >= high) return 100;
				return ((c - low) / span) * 100;
			};
		}

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