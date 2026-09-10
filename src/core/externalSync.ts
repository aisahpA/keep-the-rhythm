import { normalizeSettings, PersistedStats, PluginData } from "@/defs/types";
import { ActivityCounts, DayActivityMap, DaysMap } from "@/defs/types";
import { useStore } from "./store";
import { decodeActivities, collectActiveFiles } from "./statsCodec";
import { Notice } from "obsidian";

/**
 * 外部同步合并，按文件拆分：
 *   - mergeExternalSettings —— data.json（Obsidian 管理，经
 *     onExternalSettingsChange 推送）：外部设置整体覆盖本地。
 *   - mergeExternalStats —— 独立的 stats 数据文件（路径可配置，无
 *     data.json 式推送；靠 5s mtime 轮询 + 写前检查 + focus /
 *     visibilitychange 兜底）：行级合并进 store。
 *
 * stats 合并策略：
 *   1. 解码外部数据
 *   2. 行级合并 days:同 key (date, filePath) 比新增字数,大者赢
 *   3. 联动合并当天 baseline:当天行赢了谁的 added,就用谁的 baseline
 *      (days[today] 和 todayBaselines 是成对存在的,拆开合并会让本地
 *      下一次 editorCount - baseline 算错)
 *   4. 浅快查:合并结果与当前 store 一致则 no-op,跳过 version bump / persist
 *   5. 一次性 setState 替换数据
 *   6. requestPersist
 *
 * 不需要手动作废"当前打开文件":ensureActivityExists 的守卫直接由
 * days[today] 行 + baseline 是否存在推导,外部删除行 / baseline 后,
 * 下一次触碰自然重建。游标状态(如 getCurrentCount 的 query cursor)
 * 不受行删除影响,旧的会自然过期。
 */

export async function mergeExternalSettings(
	data: PluginData | null,
): Promise<void> {
	if (!data) return;
	const cur = useStore.getState();
	// settings: 外部覆盖,并上 defaults 兜底
	const newSettings = normalizeSettings(data.settings);
	if (JSON.stringify(newSettings) === JSON.stringify(cur.settings)) return;
	useStore.setState({ settings: newSettings });
	useStore.getState().requestPersist();
}

export async function mergeExternalStats(
	stats: PersistedStats | undefined,
): Promise<void> {
	try {
		const cur = useStore.getState();
		const today = cur.today;

		// 1. 解码外部 —— 外部数据现在活在内存里了
		const ext = decodeActivities(stats, today);

		// Guard: an external file with NO recoverable activity rows is not
		// a deletion manifest.  Sync clients can transiently deliver an
		// empty or partially-written stats file; trusting it here would drop
		// every local-only row and the requestPersist below would write the
		// wipe to disk.  Real deletions still propagate whenever the
		// external file contains at least one row.
		const extRowCount = Object.values(ext.days).reduce(
			(n, d) => n + Object.keys(d).length,
			0,
		);
		if (extRowCount === 0 && Object.keys(cur.days).length > 0) {
			console.warn(
				"KTR: external stats file has no activity rows — keeping local data.",
			);
			new Notice("Ktr: external stats file looked empty — local data kept.");
			return;
		}

		// 2. 行级合并 days —— 同 key 取新增字数大者,本地独有行丢弃
		//    (尊重外部删除)。今天的赢家是谁单独记录,用于联动 baseline。
		const mergedDays: DaysMap = {};
		const localWonToday: Record<string, boolean> = {};
		for (const [date, extDay] of Object.entries(ext.days)) {
			const localDay = cur.days[date];
			const mergedDay: DayActivityMap = {};
			for (const [filePath, extAdded] of Object.entries(extDay)) {
				const localAdded = localDay?.[filePath];
				const localWon =
					localAdded !== undefined &&
					(localAdded.w >= extAdded.w &&
						localAdded.c >= extAdded.c);
				mergedDay[filePath] = localWon ? localAdded : extAdded;
				if (date === today) localWonToday[filePath] = localWon;
			}
			mergedDays[date] = mergedDay;
		}

		// 3. 联动合并当天 baseline
		const mergedBaselines: DayActivityMap = {};
		for (const filePath of Object.keys(mergedDays[today] ?? {})) {
			let baseline: ActivityCounts | undefined;
			if (localWonToday[filePath]) {
				if (cur.todayBaselinesDay === today) {
					baseline = cur.todayBaselines[filePath];
				}
			} else if (ext.todayBaselinesDay === today) {
				baseline = ext.todayBaselines[filePath];
			}
			if (baseline !== undefined) {
				mergedBaselines[filePath] = baseline;
			}
		}
		const mergedBaselinesDay =
			Object.keys(mergedBaselines).length > 0 ? today : null;

		// 4. 浅快查:合并结果与当前 store 一致则直接返回
		if (
			isNoop(cur, {
				days: mergedDays,
				todayBaselines: mergedBaselines,
				todayBaselinesDay: mergedBaselinesDay,
			})
		) {
			return;
		}

		// 5. 合并 activeFiles —— 取并集(保留旧条目不产生误判)。
		const mergedActiveFiles = new Set([
			...cur.activeFiles,
			...collectActiveFiles(mergedDays),
		]);

		// 6. 一次性 setState
		useStore.setState({
			days: mergedDays,
			todayBaselines: mergedBaselines,
			todayBaselinesDay: mergedBaselinesDay,
			activeFiles: mergedActiveFiles,
			today,
			todayVersion: cur.todayVersion + 1,
			historicalVersion: cur.historicalVersion + 1,
		});

		// 7. 写回磁盘
		useStore.getState().requestPersist();
	} catch (error) {
		console.error("Error in mergeExternalStats:", error);
		new Notice("Ktr: failed to sync external stats file changes.");
	}
}

interface Partitions {
	days: DaysMap;
	todayBaselines: DayActivityMap;
	todayBaselinesDay: string | null;
}

/** Shallow structural equality for the no-op fast path. */
function isNoop(
	cur: ReturnType<typeof useStore.getState>,
	merged: Partitions,
): boolean {
	if (!daysEqual(cur.days, merged.days)) return false;
	if (!dayMapsEqual(cur.todayBaselines, merged.todayBaselines)) return false;
	if (cur.todayBaselinesDay !== merged.todayBaselinesDay) return false;
	return true;
}

function dayMapsEqual(a: DayActivityMap, b: DayActivityMap): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const k of aKeys) {
		const av = a[k];
		const bv = b[k];
		if (av.w !== bv.w || av.c !== bv.c) return false;
	}
	return true;
}

function daysEqual(a: DaysMap, b: DaysMap): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const date of aKeys) {
		if (!dayMapsEqual(a[date], b[date])) return false;
	}
	return true;
}
