import { TFile, MarkdownView } from "obsidian";
import { getLanguageBasedWordCount } from "@/core/wordCounting";
import { getPlugin } from "@/core/pluginRegistry";
import { useStore } from "./store";

/* ─────────────────────────────────────────────────────────────────────────
 * Baseline maintenance — the home of today's baseline rules.
 *
 * A file's baseline is its word count at the first moment it was touched
 * today; live deltas are computed as `editorCount - baseline` and stored in
 * `days[today][filePath]`.  Everything that creates, re-anchors, or
 * interprets baselines lives here so the rules are visible in one place:
 *
 *   • capture    — the first touch today reads DISK (never the editor):
 *                  at active-leaf-change the view may still hold the
 *                  previous file's content, and disk reads are immune to
 *                  keystrokes (typing only reaches disk on save), so words
 *                  typed right after focus still count as today's delta.
 *   • re-anchor  — a manually entered value becomes the anchor:
 *                  baseline = live editor count − manual value.
 *   • sampling   — live delta = editor count − baseline; a missing
 *                  baseline means sampling cannot run (and is logged).
 *   • liveness   — a file is "live" iff it has a baseline today; day
 *                  rollover ends it because the table is reset.
 *
 * Low-level state mutations (setBaseline, the day-rollover reset, delete /
 * rename of baselines) live in store.ts — they are atomic with the row
 * mutations they accompany, so they are implemented there, not here.
 * ────────────────────────────────────────────────────────────────────── */

/** Today's recorded baseline for a file, or undefined when not yet touched today. */
export function getBaseline(filePath: string): number | undefined {
	return useStore.getState().todayBaselines[filePath];
}

/** File is "live" iff today's baseline exists. Derived from data, so it
 *  naturally re-fires after midnight rollover or external sync. */
export function isFileLive(filePath: string): boolean {
	return getBaseline(filePath) !== undefined;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Word-count sources
 * ────────────────────────────────────────────────────────────────────── */

/** Read the file's current word count (cachedRead with read fallback). */
export async function getWordCountForFile(file: TFile): Promise<number> {
	const plugin = getPlugin();
	let content = await plugin.app.vault.cachedRead(file);
	// cachedRead returns Promise<string> — never null per the type
	// signature, but it CAN return an empty string when the vault cache
	// hasn't been populated yet (e.g. a freshly created file or a stale
	// cache entry).  Fall back to the uncached read in that case too.
	if (!content) {
		content = await plugin.app.vault.read(file);
	}
	return getLanguageBasedWordCount(
		content,
		useStore.getState().settings.enabledLanguages,
	);
}

/**
 * Word count preferring the live editor buffer over disk: rewriting a
 * today baseline would otherwise race unsaved edits (the change event has
 * already fired), baking a permanent offset into the day's delta.  Falls
 * back to the cached disk read when the file isn't open anywhere.
 */
export async function getCurrentWordCountLive(file: TFile): Promise<number> {
	const app = getPlugin().app;
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		if (
			leaf.view instanceof MarkdownView &&
			leaf.view.file?.path === file.path &&
			leaf.view.editor
		) {
			return getLanguageBasedWordCount(
				leaf.view.editor.getValue(),
				useStore.getState().settings.enabledLanguages,
			);
		}
	}
	return getWordCountForFile(file);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Capture & re-anchor
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Guarantee a baseline exists for `file` today, capturing it from DISK
 * when missing — either on first touch today or when the live baseline
 * was lost (e.g. stale external merge or a restart that slept through
 * midnight).  Returns the baseline.  The disk read is deliberate: the
 * editor snapshot is unreliable at this moment (see module header).
 */
export async function ensureBaseline(file: TFile): Promise<number> {
	const existing = getBaseline(file.path);
	if (existing !== undefined) return existing;
	const baseline = await getWordCountForFile(file);
	useStore.getState().setBaseline(file.path, baseline);
	return baseline;
}

/**
 * Re-anchor today's baseline so a manually entered value acts as the
 * anchor for live tracking: baseline = live editor count − manual value.
 * Subsequent typing accumulates on top of it instead of the live sampler
 * silently overriding a lower manual value.
 */
export async function setBaselineFromManualEntry(
	file: TFile,
	wordAdded: number,
): Promise<void> {
	const currentWordCount = await getCurrentWordCountLive(file);
	useStore
		.getState()
		.setBaseline(file.path, Math.max(0, currentWordCount - wordAdded));
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sampling
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Live delta = editor count − baseline.  Returns undefined when the file
 * has no baseline — sampling cannot run then.  Not an expected steady
 * state (liveness is ensured before sampling), so the missing-baseline
 * case is logged: "no number ever appears" can mean THIS (a tracking bug /
 * dropped baseline), not just a non-positive delta.
 */
export function computeLiveDelta(
	filePath: string,
	editorCount: number,
): number | undefined {
	const baseline = getBaseline(filePath);
	if (baseline === undefined) {
		console.warn(
			`KTR: no today baseline for "${filePath}" — sampling skipped. ` +
				"Possible causes: the file was first touched before tracking " +
				"was enabled, an external sync dropped today's baselines, or " +
				"the editor already contained text when the plugin loaded.",
		);
		return undefined;
	}
	return editorCount - baseline;
}