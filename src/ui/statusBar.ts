import { Plugin, setIcon } from "obsidian";
import { useStore } from "@/core/store";
import { getCurrentCount } from "@/core/dataQueries";
import { TargetCount } from "@/defs/types";
import { activateSidebarView } from "@/core/commands";
import { t } from "@/ui/i18n";

const ICON = "type";

/**
 * Status bar controller — shows today's word count against the daily goal
 * as `Ⓣ 1,234 / 500` in Obsidian's status bar.
 *
 * Reactivity mirrors the sidebar slots: it subscribes to the store's
 * version stamps (todayVersion / historicalVersion) plus the displayed
 * slices (today, enabled, dailyWritingGoal).  Typing, day rollover and
 * settings changes all bump one of those keys, so a single shallow-compared
 * selector keeps the text fresh without polling.
 */
export class TodayWordsStatusBar {
	private itemEl: HTMLElement;
	private unsubs: (() => void)[] = [];

	constructor(plugin: Plugin) {
		this.itemEl = plugin.addStatusBarItem();
		this.itemEl.addClass("ktr-status-bar");
		this.itemEl.onclick = () => void activateSidebarView();

		this.unsubs.push(
			useStore.subscribe(
				(s) => [
					s.todayVersion,
					s.historicalVersion,
					s.today,
					s.settings.statusBar?.enabled,
					s.settings.dailyWritingGoal,
				],
				() => this.render(),
				{ equalityFn: shallowEqual },
			),
		);

		this.render();
	}

	private render() {
		const { settings } = useStore.getState();
		if (!settings.statusBar?.enabled) {
			this.itemEl.hide();
			return;
		}

		const words = getCurrentCount(TargetCount.CURRENT_DAY);
		const goal = settings.dailyWritingGoal;

		this.itemEl.show();
		this.itemEl.empty();
		setIcon(this.itemEl, ICON);
		this.itemEl.createSpan({
			text: `${words.toLocaleString()} / ${goal.toLocaleString()}`,
		});
		this.itemEl.setAttribute(
			"aria-label",
			t("statusBar.aria", words.toLocaleString(), goal.toLocaleString()),
		);
	}

	dispose() {
		for (const unsub of this.unsubs) unsub();
		this.unsubs = [];
		this.itemEl.remove();
	}
}

function shallowEqual(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}
