import { Notice, Plugin } from "obsidian";

import { PluginData, Settings, StatsFileData } from "@/defs/types";
import { useStore } from "./store";
import { encodePersistedStats } from "./statsCodec";
import { mergeExternalStats } from "./externalSync";

const JSON_SCHEMA = "1.0";
const JSON_DEBOUNCE_TIME = 2000;

// ─── Stats data file paths ───

/** Default stats file location: next to data.json in the plugin folder. */
export function defaultStatsFilePath(plugin: Plugin): string {
	return `${plugin.manifest.dir}/stats.json`;
}

/**
 * Effective stats file path: the configured vault-relative path or the
 * default. `settings` can be passed explicitly on the boot path, where
 * the store is not hydrated yet.
 */
export function getStatsFilePath(plugin: Plugin, settings?: Settings): string {
	const statsFileName = (
		settings ?? useStore.getState().settings
	).statsFileName;
	return statsFileName || defaultStatsFilePath(plugin);
}

/** Create every missing folder segment of a vault-relative file path. */
export async function ensureParentFolder(
	plugin: Plugin,
	filePath: string,
): Promise<void> {
	const adapter = plugin.app.vault.adapter;
	const segments = filePath.split("/");
	segments.pop(); // file name
	let folder = "";
	for (const segment of segments) {
		folder = folder ? `${folder}/${segment}` : segment;
		if (!(await adapter.exists(folder))) {
			await adapter.mkdir(folder);
		}
	}
}

// Cached mtime of the stats file — the external-change sentinel. 0 means
// "unknown" (forces one merge check on the next write; merging freshly
// loaded data is a no-op via the isNoop fast path).
let lastStatsMtime = 0;

async function statsFileMtime(
	plugin: Plugin,
	path?: string,
): Promise<number> {
	try {
		const st = await plugin.app.vault.adapter.stat(
			path ?? getStatsFilePath(plugin),
		);
		return st?.mtime ?? 0;
	} catch {
		return 0;
	}
}

/** Re-cache the stats file mtime after WE wrote it, so the next external
 *  check doesn't mistake our own write for someone else's. */
export async function cacheStatsFileMtime(
	plugin: Plugin,
	path?: string,
): Promise<void> {
	lastStatsMtime = await statsFileMtime(plugin, path);
}

// ─── Read / write the stats data file ───

/**
 * Read and parse the stats data file. Returns null when the file is
 * missing or unreadable (the boot guard handles recovery from backups).
 */
export async function readStatsFile(
	plugin: Plugin,
	settings?: Settings,
): Promise<StatsFileData | null> {
	const path = getStatsFilePath(plugin, settings);
	try {
		if (!(await plugin.app.vault.adapter.exists(path))) return null;
		const parsed = JSON.parse(
			await plugin.app.vault.adapter.read(path),
		) as StatsFileData;
		lastStatsMtime = await statsFileMtime(plugin, path);
		return parsed;
	} catch (err) {
		console.error("KTR: can't read stats data file:", err);
		return null;
	}
}

export async function saveStatsToDisk(plugin: Plugin): Promise<void> {
	// A sync client may have replaced the file since our last write; merge
	// it first so this whole-file write can't clobber its rows.
	await checkExternalStatsFile(plugin);
	const data = prepareStatsData();
	const path = getStatsFilePath(plugin);
	try {
		await plugin.app.vault.adapter.write(path, JSON.stringify(data));
	} catch (err) {
		console.error("KTR: can't write stats data file:", err);
		new Notice("Ktr: failed to write the stats data file — see console.");
		return;
	}
	lastStatsMtime = await statsFileMtime(plugin, path);
}

/**
 * Pick up an externally replaced stats file (multi-device sync). A stat()
 * whose mtime differs from the cached value means the file changed behind
 * our back: read it and row-merge it into the store. No-op otherwise.
 */
export async function checkExternalStatsFile(plugin: Plugin): Promise<void> {
	const path = getStatsFilePath(plugin);
	let mtime: number;
	try {
		const st = await plugin.app.vault.adapter.stat(path);
		if (!st) return; // file missing — nothing to merge, keep local data
		mtime = st.mtime;
	} catch {
		return; // unreadable — keep what we have
	}
	if (mtime === lastStatsMtime) return;
	lastStatsMtime = mtime;
	const data = await readStatsFile(plugin);
	if (data) await mergeExternalStats(data.stats);
}

// ─── Persisted payload assembly ───

export function prepareSettingsData(): PluginData {
	return { schema: JSON_SCHEMA, settings: useStore.getState().settings };
}

export function prepareStatsData(): StatsFileData {
	const {
		today,
		days,
		todayBaselines,
		todayBaselinesDay,
		historicalVersion,
	} = useStore.getState();

	return {
		schema: JSON_SCHEMA,
		stats: encodePersistedStats({
			today,
			days,
			todayBaselines,
			todayBaselinesDay,
			historicalVersion,
		}),
	};
}

// Last serialized settings payload — stats churn must not rewrite the
// settings file (and its sync traffic) when nothing changed.
let lastSettingsJson = "";

export async function saveSettingsToDisk(plugin: Plugin): Promise<void> {
	const data = prepareSettingsData();
	const json = JSON.stringify(data);
	if (json === lastSettingsJson) return;
	lastSettingsJson = json;
	await plugin.saveData(data);
}

/**
 * Persist ALL in-memory state: settings → data.json (only when changed),
 * stats → the configurable stats data file.  Constructs both payloads
 * directly from the store — no intermediate staging buffer.
 */
async function saveDataToDisk(plugin: Plugin) {
	await saveSettingsToDisk(plugin);
	await saveStatsToDisk(plugin);
}

// ─── Stats file location switch ───

/**
 * Move the stats data file to `newPath` (vault-relative, including the
 * file name); an empty path resets to the default location next to
 * data.json.  The store is the source of truth, so the switch writes the
 * current in-memory data to the target and removes the old file; if the
 * target already exists it is parsed and row-merged into the store first
 * (same max-wins rule as external sync), so nothing is lost either way.
 * An unreadable target still blocks the switch.
 * @returns true on success (including "already using newPath").
 */
export async function switchStatsFile(
	plugin: Plugin,
	newPath: string,
): Promise<boolean> {
	const targetPath = newPath.trim();
	const target =
		targetPath === "" ? defaultStatsFilePath(plugin) : targetPath;
	if (
		!target.endsWith(".json") ||
		target.startsWith("/") ||
		target.includes("\\") ||
		target.split("/").includes("..")
	) {
		new Notice(
			"Ktr: invalid data file path — use a vault-relative .json path.",
		);
		return false;
	}

	const currentPath = getStatsFilePath(plugin);
	if (target === currentPath) return true;

	try {
		const adapter = plugin.app.vault.adapter;
		if (await adapter.exists(target)) {
			try {
				const parsed = JSON.parse(
					await adapter.read(target),
				) as StatsFileData;
				await mergeExternalStats(parsed?.stats);
			} catch (err) {
				console.error("KTR: can't adopt existing data file:", err);
				new Notice(
					"Ktr: existing file at the target path could not be read.",
				);
				return false;
			}
		}

		await ensureParentFolder(plugin, target);
		await adapter.write(target, JSON.stringify(prepareStatsData()));
		if (await adapter.exists(currentPath)) {
			await adapter.remove(currentPath);
		}
		lastStatsMtime = await statsFileMtime(plugin, target);
	} catch (err) {
		console.error("KTR: can't switch data file location:", err);
		new Notice("Ktr: failed to switch the data file — see console.");
		return false;
	}

	// Persist the new location (settings live in data.json).
	useStore.getState().mutateSettings((draft) => {
		draft.statsFileName = targetPath;
	});
	new Notice(
		targetPath === ""
			? "Ktr: data file reset to the default location."
			: `KTR: data file moved to ${targetPath}.`,
	);
	return true;
}

// ─── Persistence scheduling ───

/**
 * Holds the debounce and generation state for persistence scheduling.
 */
export interface PersistenceScheduler {
	dispose: () => void;
	/**
	 * Cancel any pending debounced save and write the in-memory store to
	 * data.json / the stats file immediately.  Used by visibilitychange /
	 * pagehide handlers because requestAnimationFrame is paused in
	 * background tabs — without an explicit flush, a user who types and
	 * then switches apps for a while can lose their last few edits to an
	 * OS kill or hard reload.
	 */
	flushNow: () => Promise<void>;
}

/**
 * Setup debounced JSON persistence scheduling.
 * Subscribes to persistVersion changes from store and schedules debounced saves.
 * Returns scheduler with dispose to be called on unload.
 */
export function setupPersistenceScheduling(
	plugin: Plugin,
): PersistenceScheduler {
	let JsonDebounceTimeout: number | null = null;
	let _saveGen = 0;

	const scheduleSave = () => {
		if (JsonDebounceTimeout !== null) window.clearTimeout(JsonDebounceTimeout);

		_saveGen++;
		const gen = _saveGen;
		JsonDebounceTimeout = window.setTimeout(() => {
			if (gen !== _saveGen) return;
			JsonDebounceTimeout = null;
			void saveDataToDisk(plugin);
		}, JSON_DEBOUNCE_TIME);
	};

	const unsub = useStore.subscribe(
		(s) => s.persistVersion,
		() => scheduleSave(),
	);

	const flushNow = async () => {
		if (JsonDebounceTimeout !== null) {
			window.clearTimeout(JsonDebounceTimeout);
			JsonDebounceTimeout = null;
		}
		_saveGen++; // invalidate any in-flight debounced save
		await saveDataToDisk(plugin);
	};

	return {
		dispose: () => {
			unsub();
			_saveGen++;
			if (JsonDebounceTimeout !== null) window.clearTimeout(JsonDebounceTimeout);
			JsonDebounceTimeout = null;
		},
		flushNow,
	};
}
