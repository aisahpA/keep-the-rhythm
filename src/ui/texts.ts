import { t } from "./i18n";
import { TargetCount } from "@/defs/types";

const WEEKDAY_KEYS = [
	"weekday.mon",
	"weekday.tue",
	"weekday.wed",
	"weekday.thu",
	"weekday.fri",
	"weekday.sat",
	"weekday.sun",
] as const;

const MONTH_KEYS = [
	"month.1",
	"month.2",
	"month.3",
	"month.4",
	"month.5",
	"month.6",
	"month.7",
	"month.8",
	"month.9",
	"month.10",
	"month.11",
	"month.12",
] as const;

export function getWeekdaysNames(): string[] {
	return WEEKDAY_KEYS.map((key) => t(key));
}

export function getMonthNames(): string[] {
	return MONTH_KEYS.map((key) => t(key));
}

export function getSlotLabel(option: TargetCount): string {
	switch (option) {
		case TargetCount.CURRENT_FILE:
			return t("slot.currentFile");
		case TargetCount.CURRENT_DAY:
			return t("slot.currentDay");
		case TargetCount.CURRENT_WEEK:
			return t("slot.currentWeek");
		case TargetCount.CURRENT_MONTH:
			return t("slot.currentMonth");
		case TargetCount.CURRENT_YEAR:
			return t("slot.currentYear");
		case TargetCount.LAST_DAY:
			return t("slot.lastDay");
		case TargetCount.LAST_WEEK:
			return t("slot.lastWeek");
		case TargetCount.LAST_MONTH:
			return t("slot.lastMonth");
		case TargetCount.LAST_YEAR:
			return t("slot.lastYear");
		case TargetCount.CURRENT_STREAK:
			return t("slot.currentStreak");
	}
}
