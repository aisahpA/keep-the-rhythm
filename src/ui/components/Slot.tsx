import { getCurrentWeekDates } from "@/utils/dateUtils";
import React from "react";
import { setIcon } from "obsidian";
import { useRef, useMemo, useCallback } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

import { getCurrentCount, selectTodayVersion, selectHistoricalVersion } from "@/core/dataQueries";
import { getDailySummaryMap } from "@/utils/dailySummaryCache";
import { CalculationType } from "@/defs/types";
import { Tooltip } from "./Tooltip";
import { UnitLabel } from "./UnitLabel";
import { getSlotLabel, getWeekdaysNames } from "../texts";
import { TargetCount, SlotConfig, Unit } from "@/defs/types";
import { useStore } from "@/core/store";
import { t } from "@/ui/i18n";

const TARGET_COUNTS = Object.values(TargetCount);

export const Slot = React.memo(function Slot({
	index,
	option,
	unit,
	calc,
	onDelete,
	isCodeBlock,
}: SlotConfig & {
	onDelete: (index: number) => void;
	isCodeBlock?: boolean;
}) {
	// No local mirror: read directly from props.  The previous useState
	// mirror was redundant (every toggle already called setOptionType /
	// setCalcType) and would silently drift out of sync if the store was
	// mutated externally (e.g. by another codeBlock).
	const optionType = option;
	const calcMode = calc;
	const unitType = unit;

	const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
	const calcButtonRef = useRef<HTMLButtonElement | null>(null);
	const unitButtonRef = useRef<HTMLButtonElement | null>(null);

	// Reactive slices of the store the slot's value depends on.  Each
	// selector re-renders the component only when that slice changes,
	// replacing the old SETTINGS_CHANGED / DAY_CHANGED / HISTORY_DATA_CHANGED
	// event listeners.
	const todayVersion = useStore(selectTodayVersion);
	const historicalVersion = useStore(selectHistoricalVersion);
	// Only CURRENT_FILE slots subscribe: the selector returns a constant
	// for every other type, so file switches don't re-render/re-compute them.
	const activeFileVersion = useStore((s) =>
		optionType === TargetCount.CURRENT_FILE ? s.activeFileVersion : 0,
	);
	const dailyWritingGoal = useStore((s) => s.settings.dailyWritingGoal);
	const mutateSettings = useStore((s) => s.mutateSettings);

	// useLiveQuery is gone — getCurrentCount reads useStore.getState()
	// synchronously, so we just memoize on the slices the count depends on.
	// Using version numbers instead of the dailyActivity array reference
	// avoids unnecessary recomputation when only unrelated entries change.
	// activeFileVersion only changes for CURRENT_FILE slots (see selector);
	// while typing, todayVersion bumps on each debounced sample.
	const value = useMemo(
		() => getCurrentCount(optionType, calcMode, unitType),
		[optionType, calcMode, unitType, todayVersion, historicalVersion, activeFileVersion, dailyWritingGoal],
	);

	const showCalcType =
		optionType !== TargetCount.CURRENT_DAY &&
		optionType !== TargetCount.LAST_DAY &&
		optionType !== TargetCount.CURRENT_STREAK &&
		optionType !== TargetCount.CURRENT_FILE;

	// Ref callbacks with dataset guard: setIcon only fires once per DOM
	// node, not on every re-render or effect cycle (React 18 strict mode
	// double-invokes effects, and refs that are JSX inline functions get
	// torn down/re-attached on every render).  setIcon is a non-trivial
	// DOM op (creates an <svg>), so the dedup matters.
	const setCalcButtonIcon = useCallback(
		(el: HTMLButtonElement | null) => {
			if (!el || el.dataset.iconSet === calcMode) return;
			setIcon(el, calcMode === CalculationType.TOTAL ? "chart-spline" : "sigma");
			el.dataset.iconSet = calcMode;
		},
		[calcMode],
	);

	const setUnitButtonIcon = useCallback((el: HTMLButtonElement | null) => {
		if (!el || el.dataset.iconSet) return;
		setIcon(el, "case-sensitive");
		el.dataset.iconSet = "1";
	}, []);

	const setDeleteButtonIcon = useCallback(
		(el: HTMLButtonElement | null) => {
			if (!el || el.dataset.iconSet) return;
			setIcon(el, "x");
			el.dataset.iconSet = "1";
		},
		[],
	);

	const toggleCalculation = () => {
		const newCalc =
			calcMode == CalculationType.TOTAL
				? CalculationType.AVG
				: CalculationType.TOTAL;

		// Persist the new calc mode into settings (mutateSettings syncs
		// the store + saves to data.json, replacing plugin.quietSave()).
		mutateSettings((draft) => {
			draft.sidebarConfig.slots[index].calc = newCalc;
		});
	};

	const toggleUnit = () => {
		const newUnit: Unit = unitType === Unit.WORD ? Unit.CHAR : Unit.WORD;
		mutateSettings((draft) => {
			draft.sidebarConfig.slots[index].unit = newUnit;
		});
	};

	const selectType = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const newOption = event.target.value as TargetCount;
		mutateSettings((draft) => {
			draft.sidebarConfig.slots[index].option = newOption;
		});
	};

	const progressValue =
		optionType === TargetCount.CURRENT_DAY && dailyWritingGoal > 0
			? Math.min(((value ?? 0) / dailyWritingGoal) * 100, 100)
			: 0;

	// Memoize the 7-day completion states for CURRENT_WEEK view.
	// Computes getDailySummaryMap() once (not 7×) and caches the
	// week's date lookups. Recomputes only when the date or relevant
	// data versions change.
	const weekDayCompletedStates = useMemo<boolean[]>(() => {
		if (optionType !== TargetCount.CURRENT_WEEK) return [];
		const map = getDailySummaryMap();
		const weekDates = getCurrentWeekDates();
		return weekDates.map((date) => (map[date]?.w ?? 0) >= dailyWritingGoal);
	}, [optionType, todayVersion, historicalVersion, dailyWritingGoal]);

	return (
		<div className="slot">
			<div className="slot__header">
				<div className="slot__label">{getSlotLabel(optionType)}</div>
				{!isCodeBlock && (
					<div className="slot__buttons">
						<RadixTooltip.Provider delayDuration={200}>
							{showCalcType && (
								<Tooltip
									content={
										calcMode == CalculationType.TOTAL
											? t("slot.showDailyAverage")
											: t("slot.showTotal")
									}
								>
									<button
										className="KTR-min-button"
										ref={(el) => {
											calcButtonRef.current = el;
											setCalcButtonIcon(el);
										}}
										onClick={() => {
											toggleCalculation();
										}}
									></button>
								</Tooltip>
							)}

							<Tooltip content={t("slot.changeUnit")}>
								<button
									className="KTR-min-button"
									ref={(el) => {
										unitButtonRef.current = el;
										setUnitButtonIcon(el);
									}}
									onClick={() => {
										toggleUnit();
									}}
								></button>
							</Tooltip>
							<Tooltip content={t("slot.changeType")}>
								<select
									className="KTR-min-select"
									value={optionType}
									onChange={selectType}
									onClick={(e) => e.stopPropagation()}
								>
									{TARGET_COUNTS.map((tc) => (
										<option key={tc} value={tc}>
											{getSlotLabel(tc)}
										</option>
									))}
								</select>
							</Tooltip>
							<Tooltip content={t("common.delete")}>
								<button
									className="KTR-min-button"
									ref={(el) => {
										deleteButtonRef.current = el;
										setDeleteButtonIcon(el);
									}}
									onClick={() => {
										onDelete(index);
									}}
								></button>
							</Tooltip>
						</RadixTooltip.Provider>
					</div>
				)}
			</div>
			<div className="slot__data">
				<div className="slot__value">{value.toLocaleString()}</div>
				<div className="slot__unit">
					{optionType === TargetCount.CURRENT_STREAK ? (
						t("common.days")
					) : (
						<UnitLabel unit={unitType} />
					)}
					<span className="slot__unit-avg">
						{showCalcType && calcMode == CalculationType.AVG ? t("common.perDay") : ""}
					</span>
				</div>
			</div>
			{optionType === TargetCount.CURRENT_DAY && unitType !== Unit.CHAR && (
				<div className="today-progress-bar">
					<div
						className={`progress ${progressValue === 100 ? "completed" : ""}`}
						style={{
							width: progressValue + "%",
						}}
					></div>
				</div>
			)}
			{optionType === TargetCount.CURRENT_WEEK && (
				<div className="KTR-week-progress">
					{getWeekdaysNames().map((_, index) => (
						<div
							key={index}
							className={
								"KTR-dot " +
								(weekDayCompletedStates[index] ? "completed" : "")
							}
						></div>
					))}
				</div>
			)}
		</div>
	);
});
