import { Notice, App, Plugin } from "obsidian";
import { PluginData, DEFAULT_SETTINGS } from "@/defs/types";
import { formatDate } from "@/utils/dateUtils";

const DEFAULT_BACKUP_DAYS = 7;
const DEFAULT_SCHEMA = "0.5";
const BACKUP_DATE_RE = /^backup-(\d{4}-\d{2}-\d{2})(?:-[\w\d.]+)?\.json$/;

/**
 * Snapshot the raw on-disk data.json into the backup folder — once per day.
 * If today's backup already exists it is left untouched, so the retained
 * copy is always the state captured at the FIRST open of the day, i.e.
 * taken before any in-session reset could overwrite it.  The file is read
 * raw (no parse), so even an unparseable data.json lands in the backup.
 */
export async function snapshotRawDataFile(
	plugin: Plugin,
	app: App,
	loadedData: PluginData | null,
): Promise<void> {
	// Corrupt/missing settings must not disable the safety net — fall back
	// to the shipped defaults (backups enabled).
	const config = loadedData?.settings?.backupConfig ?? DEFAULT_SETTINGS.backupConfig;

	const folderPath = config.folderPath || ".keep-the-rhythm2";
	const fileName = `backup-${formatDate(new Date())}-${loadedData?.schema ?? DEFAULT_SCHEMA}.json`;
	const backupPath = `${folderPath}/${fileName}`;
	const dataPath = `${plugin.manifest.dir}/data.json`;

	try {
		if (await app.vault.adapter.exists(backupPath)) return;
		if (!(await app.vault.adapter.exists(dataPath))) return;

		if (!(await app.vault.adapter.exists(folderPath))) {
			await app.vault.adapter.mkdir(folderPath);
		}
		await app.vault.adapter.write(backupPath, await app.vault.adapter.read(dataPath));
		new Notice("Ktr: New backup saved.");
	} catch (err) {
		console.error("KTR Error trying to create backup: ", err);
		new Notice("Ktr: Backup failed — see developer console for details.");
	}

	await cleanOlderBackups(folderPath, config.maxNumberOfBackups ?? DEFAULT_BACKUP_DAYS, app);
}

/**
 * Keep backups of the newest `maxDays` distinct dates, delete the rest.
 * Pruning is per-DAY, not per-file, so any number of same-day restarts can
 * never evict previous days' backups.  Dates are ISO strings, so a lexical
 * sort is chronological.
 */
async function cleanOlderBackups(
	folderPath: string,
	maxDays: number,
	app: App,
): Promise<void> {
	const { files } = await app.vault.adapter.list(folderPath);

	const dayByFile = new Map<string, string>();
	for (const fullPath of files) {
		const match = fullPath.split("/").pop()?.match(BACKUP_DATE_RE);
		if (match) dayByFile.set(fullPath, match[1]);
	}
	if (dayByFile.size === 0) return;

	const keepDays = new Set(
		[...new Set(dayByFile.values())].sort().reverse().slice(0, maxDays),
	);

	for (const [fullPath, day] of dayByFile) {
		if (!keepDays.has(day)) {
			await app.vault.adapter.remove(fullPath);
		}
	}
}
