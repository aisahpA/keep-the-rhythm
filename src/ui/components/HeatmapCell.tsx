import { getLeafWithFile } from "../../utils/utils";
import React, { useMemo } from "react";
import { HeatmapColorModes, Unit } from "../../defs/types";
import * as obsidian from "obsidian";
import { Tooltip } from "./Tooltip";
import { getCorePluginSettings } from "../../utils/windowUtility";
import { getPlugin } from "@/core/pluginRegistry";
import { useStore } from "@/core/store";
import { moment as _moment } from "obsidian";
const moment = _moment as unknown as typeof _moment.default;

interface HeatmapCellProps {
	intensity: number;
	count: number;
	unit?: Unit;
	date: string;
	mode: HeatmapColorModes;
	squared?: boolean;
	cellSize?: number;
	isToday: boolean;
	/** True when another month/weekday is hovered — dims non-matching cells. */
	dimmed?: boolean;
	/**
	 * When provided, clicking the cell reports the date instead of opening
	 * the day's daily note (used by the sidebar to drive the Entries list).
	 */
	onCellClick?: (date: string) => void;
	selected?: boolean;
}

/**
 * Memoized heatmap cell.  All props are primitives, so React's default
 * Object.is shallow comparison is enough: when the user types in today's
 * file, only the today cell's count / intensity change and the other 363
 * cells skip the re-render.  Without this, every keystroke re-reconciles
 * 7 x weeksToShow cells, which dominates the typing cost.
 */
export const HeatmapCell = React.memo(function HeatmapCell({
	intensity,
	count,
	unit = Unit.WORD,
	date,
	mode,
	squared,
	cellSize,
	isToday,
	dimmed,
	onCellClick,
	selected,
}: HeatmapCellProps) {
	const handleClick = async (_event: React.MouseEvent<HTMLDivElement>) => {
		if (onCellClick) {
			onCellClick(date);
			return;
		}

		const app = getPlugin().app;
		if (!useStore.getState().settings.heatmapNavigation) return;

		const dailyNotesSettings = getCorePluginSettings("daily-notes");
		let notePath = "";

		if (dailyNotesSettings?.folder) {
			notePath += dailyNotesSettings.folder.endsWith("/")
				? dailyNotesSettings.folder
				: dailyNotesSettings.folder + "/";
		}

		if (dailyNotesSettings?.format) {
			notePath += moment(date, "YYYY-MM-DD").format(
				dailyNotesSettings.format,
			);
		} else {
			notePath += date;
		}

		notePath += ".md";

		const existingFile = app.vault.getAbstractFileByPath(notePath);

		if (existingFile instanceof obsidian.TFile) {
			const existingLeaf = getLeafWithFile(app, existingFile);
			if (existingLeaf) {
				app.workspace.setActiveLeaf(existingLeaf);
			} else {
				await app.workspace.getLeaf(true).openFile(existingFile);
			}
		} else {
			const newFile = await app.vault.create(notePath, "");
			await app.workspace.getLeaf(true).openFile(newFile);
		}
	};

	let intensityClass = "";

	if (
		mode == HeatmapColorModes.STOPS ||
		mode == HeatmapColorModes.SOLID ||
		intensity == 0
	) {
		intensityClass = "level-" + intensity + " ";
	} else if (mode == HeatmapColorModes.GRADUAL) {
		intensityClass = "proportional-intensity";
	} else if (mode == HeatmapColorModes.LIQUID) {
		intensityClass = "liquid-intensity";
	}
	const isTodayClass = isToday ? "heatmap-square-today" : "";

	const isSelectedClass = selected ? "heatmap-square-selected" : "";

	const isSquaredClass = squared ? "cell-squared" : "cell-rounded";

	const isDimmedClass = dimmed ? "heatmap-square-dimmed" : "";

	const classes = `heatmap-square ${isTodayClass} ${isSquaredClass} ${isSelectedClass} ${isDimmedClass} ${intensityClass}`;

	const style = {
		"--intensity": `${intensity}%`,
		width: cellSize,
		height: cellSize,
	} as React.CSSProperties & Record<string, string | number>;

	const unitLabel = unit === Unit.CHAR ? "chars" : "words";

	const tooltipContent = useMemo(
		() => (
			<>
				<strong>{date}</strong>
				<div>
					{count.toLocaleString()} {unitLabel}
				</div>
			</>
		),
		[date, count, unitLabel],
	);

	return (
		<Tooltip content={tooltipContent}>
			<div
				onClick={(e) => void handleClick(e)}
				className={classes}
				style={style}
			></div>
		</Tooltip>
	);
});
