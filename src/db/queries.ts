import { getDateStreaks } from "@/utils/utils";
import { getDB } from "./db";
import { Language, Unit, TargetCount, CalculationType } from "../defs/types";
import { formatDate } from "@/utils/dateUtils";
import { EVENTS, state } from "@/core/pluginState";
import {
	getStartOfMonth,
	getStartOfWeek,
	getStartOfYear,
} from "@/utils/dateUtils";
import { sumTimeEntries } from "@/utils/utils";
import { DailyActivity } from "./types";
import { moment as _moment, debounce, Notice, Vault } from "obsidian";
import { getFileWordAndCharCount } from "@/utils/utils";
import { isPathTracked } from "@/core/pathFilter";

const moment = _moment as unknown as typeof _moment.default;

export async function getActivityByDate(date: string) {
	return await getDB().dailyActivity.where("date").equals(date).toArray();
}

/** Expects that there is only one activity for that file */
// TODO: maybe I could check here if the file activity is duplicated to avoid errors.
export async function getActivtityForFile(date: string, filePath: string) {
	return await getDB()
		.dailyActivity.where("[date+filePath]")
		.equals([date, filePath])
		.first();
}

export async function getTotalValueByDate(
	date: string,
	unit: Unit,
): Promise<number> {
	const activities = await getDB()
		.dailyActivity.where("date")
		.equals(date)
		.toArray();

	let value = activities.reduce((sum, activity) => {
		return sum + sumTimeEntries(activity, unit, true);
	}, 0);

	return value || 0;
}

export async function getTotalValueInDateRange(
	startDate: string,
	endDate: string,
	unit: Unit,
) {
	const activities = await getDB()
		.dailyActivity.where("date")
		.between(startDate, endDate, true, true)
		.toArray();

	let value = activities.reduce((sum, activity) => {
		return sum + sumTimeEntries(activity, unit, true);
	}, 0);

	return value;
}

export async function removeDuplicatedDailyEntries() {
	const allEntries = await getDB().dailyActivity.toArray();

	const uniqueEntries = new Map();
	const duplicateIds = [];

	for (const entry of allEntries) {
		const key = `${entry.date}-${entry.filePath}`;

		if (!uniqueEntries.has(key)) {
			uniqueEntries.set(key, entry);
		} else {
			const existingEntry = uniqueEntries.get(key);
			existingEntry.wordsAdded = (existingEntry.wordsAdded || 0) + (entry.wordsAdded || 0);
			existingEntry.charsAdded = (existingEntry.charsAdded || 0) + (entry.charsAdded || 0);

			if (entry.id !== undefined) {
				duplicateIds.push(entry.id);
			}
		}
	}

	for (const entry of uniqueEntries.values()) {
		if (entry.id !== undefined) {
			await getDB().dailyActivity.update(entry.id, {
				wordsAdded: entry.wordsAdded,
				charsAdded: entry.charsAdded,
			});
		}
	}

	if (duplicateIds.length > 0) {
		await getDB().dailyActivity.bulkDelete(duplicateIds);
	}

	return {
		totalEntries: allEntries.length,
		uniqueEntries: uniqueEntries.size,
		duplicatesRemoved: duplicateIds.length,
	};
}

export async function getActivitiesFromLast24Hours(): Promise<DailyActivity[]> {
	const now = moment();
	const yesterday = now.clone().subtract(1, "day").format("YYYY-MM-DD");
	const today = now.format("YYYY-MM-DD");

	const yesterdayActivities = await getDB()
		.dailyActivity.where("date")
		.equals(yesterday)
		.toArray();

	const todayActivities = await getDB()
		.dailyActivity.where("date")
		.equals(today)
		.toArray();

	return [...yesterdayActivities, ...todayActivities];
}

export async function getTotalValueFromLast24Hours(
	unit: Unit,
): Promise<number> {
	const activities = await getActivitiesFromLast24Hours();
	return sumLast24Hours(activities, unit);
}

export function sumLast24Hours(
	activities: DailyActivity[],
	unit: Unit,
	now: Date = new Date(),
): number {
	const cutoff = moment(now).subtract(24, "hours").format("YYYY-MM-DD");

	let total = 0;

	for (const activity of activities) {
		// Only include activities from dates within the last 24 hours.
		// Since we no longer store per-time-slot data, we approximate by
		// checking if the activity's date falls on or after the cutoff date.
		if (activity.date >= cutoff) {
			total +=
				unit === Unit.WORD
					? activity.wordsAdded || 0
					: activity.charsAdded || 0;
		}
	}

	return total;
}

export async function getWholeVaultCount(
	unit: Unit,
	vault: Vault,
	enabledLanguages: Language[],
) {
	const needsRecalc =
		state.plugin.data.stats?.wholeVaultWordCount === undefined ||
		state.plugin.data.stats?.wholeVaultCharCount === undefined;

	if (needsRecalc) {
		if (!state.plugin.data.stats) {
			return 0;
		}
		// expensive!
		const files = vault
			.getMarkdownFiles()
			.filter((f) => isPathTracked(f.path));
		let wordSum = 0;
		let charSum = 0;

		for (let i = 0; i < files.length; i++) {
			const fileContent = await vault.cachedRead(files[i]);
			const [fileWordCount, fileCharCount] =
				await getFileWordAndCharCount(fileContent, enabledLanguages);
			wordSum += fileWordCount;
			charSum += fileCharCount;
		}
		state.plugin.data.stats.wholeVaultWordCount = wordSum;
		state.plugin.data.stats.wholeVaultCharCount = charSum;
	}

	// get base count + activity changes
	const baseCount =
		unit === Unit.CHAR
			? state.plugin.data.stats?.wholeVaultCharCount
			: state.plugin.data.stats?.wholeVaultWordCount;
	if (!baseCount) return 0;

	return baseCount;
}

export async function getCurrentCount(
	unit: Unit,
	target: TargetCount,
	calc?: CalculationType,
): Promise<number> {
	if (target === TargetCount.CURRENT_FILE) {
		if (state.currentActivity) {
			return sumTimeEntries(state?.currentActivity, unit) || 0;
		} else {
			// No current session - just sum all past activity for this file
			const activeFile = state.plugin.app.workspace.getActiveFile();
			if (activeFile) {
				const activities = await getDB()
					.dailyActivity.where("filePath")
					.equals(activeFile.path)
					.toArray();
				return activities.reduce((sum, activity) => {
					return sum + sumTimeEntries(activity, unit, false);
				}, 0);
			}
			return 0;
		}
	}

	let startDate: string;
	let totalDays: number;

	switch (target) {
		case TargetCount.CURRENT_STREAK:
			// return state.plugin.data?.stats?.currentStreak || 0;
			if (state.plugin.data.stats?.daysWithCompletedGoal) {
				const { currentStreak } = getDateStreaks(
					state.plugin.data.stats?.daysWithCompletedGoal,
				);
				return currentStreak;
			} else {
				return 0;
			}

		case TargetCount.CURRENT_DAY:
			return await getTotalValueByDate(state.today, unit);

		case TargetCount.CURRENT_WEEK:
			startDate = formatDate(getStartOfWeek(new Date()));
			totalDays = moment(state.today).diff(startDate, "days") + 1;
			break;

		case TargetCount.CURRENT_MONTH:
			startDate = formatDate(getStartOfMonth(new Date()));
			totalDays = moment(state.today).diff(startDate, "days") + 1;
			break;

		case TargetCount.CURRENT_YEAR:
			startDate = formatDate(getStartOfYear(new Date()));
			totalDays =
				Math.floor(
					(new Date(state.today).getTime() -
						new Date(startDate).getTime()) /
						(1000 * 3600 * 24),
				) + 1;
			break;

		case TargetCount.LAST_DAY:
			return getTotalValueFromLast24Hours(unit);
			break;

		case TargetCount.LAST_WEEK:
			startDate = moment(state.today)
				.subtract(7, "days")
				.format("YYYY-MM-DD");
			totalDays = 7;
			break;

		case TargetCount.LAST_MONTH:
			startDate = moment(state.today)
				.subtract(30, "days")
				.format("YYYY-MM-DD");
			totalDays = 30;
			break;

		case TargetCount.LAST_YEAR:
			startDate = moment(state.today)
				.subtract(365, "days")
				.format("YYYY-MM-DD");
			totalDays = 365;
			break;

		case TargetCount.WHOLE_VAULT:
			return await getWholeVaultCount(
				unit,
				state.plugin.app.vault,
				state.plugin.data.settings.enabledLanguages,
			);

		default:
			console.info(target);
			throw new Error("Unsupported target type");
	}

	const value = await getTotalValueInDateRange(startDate, state.today, unit);
	return calc === CalculationType.AVG ? Math.round(value / totalDays) : value;
}

export const deleteActivityById = async (entryId: number | undefined) => {
	if (!entryId) return;
	getDB().dailyActivity.delete(entryId);
};

export const deleteActivityFromDate = async (
	filePath: string,
	date: string,
) => {
	if (filePath == state.currentActivity?.filePath) {
		state.setCurrentActivity(null);
	}

	const entry = await getDB()
		.dailyActivity.where("[date+filePath]")
		.equals([date, filePath])
		.first();

	if (entry?.id) {
		getDB().dailyActivity.delete(entry.id);
		state.emit(EVENTS.REFRESH_EVERYTHING);
	} else {
		const notice = new Notice(
			"Failed to delete this entry! This is a bug, contact the developer.",
		);
	}
};

export async function addDeltaToActivity(
	dailyActivity: DailyActivity,
	wordsDelta: number,
	charsDelta: number,
) {
	await getDB()
		.dailyActivity.where("[date+filePath]")
		.equals([dailyActivity.date, dailyActivity.filePath])
		.modify((selectedEntry) => {
			selectedEntry.wordsAdded = (selectedEntry.wordsAdded || 0) + wordsDelta;
			selectedEntry.charsAdded = (selectedEntry.charsAdded || 0) + charsDelta;
		});
}
