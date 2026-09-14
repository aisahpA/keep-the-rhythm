import { useStore } from "./store";
import {
	TFile,
	Editor,
	WorkspaceLeaf,
	MarkdownView,
	debounce,
	type MarkdownFileInfo,
} from "obsidian";
import { countWordsAndChars } from "@/core/wordCounting";
import { getExistingOrCreateNewEntry } from "@/core/dataQueries";
import { computeLiveDelta, isFileLive } from "@/core/baselines";
import { getPlugin } from "./pluginRegistry";
import { isPathTracked } from "./pathFilter";

// Per-file-path guard — prevents re-entrant activity creation for the
// same file without blocking other files.  A module-level boolean would
// incorrectly intercept a different file's initialization when the user
// switches tabs while the first file's async disk read is still in flight.
const updatingFiles = new Set<string>();

type FileChangeInfo = MarkdownView | MarkdownFileInfo;

const store = () => useStore.getState();

// Sample at most once per second, using the latest editor state. resetTimer
// = false makes it a throttle: the count refreshes while typing (bounded to
// ~1s staleness) instead of waiting for a pause.
const runEditorSample = debounce(
	(editor: Editor, info: FileChangeInfo) => runPendingEditorChange(editor, info),
	1000,
	false,
);

function isMarkdown(file: TFile | null | undefined): file is TFile {
	return !!file && file.extension === "md";
}

async function ensureActivityExists(file: TFile) {
	if (updatingFiles.has(file.path) || isFileLive(file.path)) return;

	updatingFiles.add(file.path);
	try {
		await flushPendingEditorChange();
		const st = store();
		await getExistingOrCreateNewEntry(file, st.today);
	} catch (error) {
		console.error("Error creating or updating entry:", error);
	} finally {
		updatingFiles.delete(file.path);
	}
}

export async function handleFileOpen(leaf: WorkspaceLeaf | null) {
	// Signal CURRENT_FILE slots (active file changed, even if the leaf
	// isn't a tracked markdown view — the slot should then read 0).
	useStore.setState((s) => ({ activeFileVersion: s.activeFileVersion + 1 }));

	// Flush any pending sample from the previously focused leaf.
	await flushPendingEditorChange();

	if (!leaf || !(leaf.view instanceof MarkdownView)) return;
	const file = leaf.view.file;
	if (!isMarkdown(file)) return;
	if (!isPathTracked(file.path)) return;
	if (isFileLive(file.path) || updatingFiles.has(file.path)) return;

	// The baseline comes from the file's DISK content, not from the editor
	// snapshot: at active-leaf-change time the view may still be displaying
	// the PREVIOUS file's content (the new file loads asynchronously), so
	// editor.getValue() can bake the wrong file's word count into today's
	// baseline.  Disk reads are immune to that staleness AND to keystrokes
	// (typing only reaches disk on save), so words typed right after focus
	// still count as today's delta.
	await ensureActivityExists(file);
}

export async function handleEditorChange(
	editor: Editor,
	info: FileChangeInfo,
) {
	const file = info.file;
	if (!isMarkdown(file) || !isPathTracked(file.path)) {
		return;
	}

	await ensureActivityExists(file);
	runEditorSample(editor, info);
}

export async function flushPendingEditorChange(): Promise<void> {
	await runEditorSample.run();
}

async function runPendingEditorChange(
	editor: Editor,
	info: FileChangeInfo,
): Promise<void> {
	const filePath = info.file?.path;
	if (!filePath) return;

	try {
		const cur = store();
		const newCounts = countWordsAndChars(editor.getValue());

		const delta = computeLiveDelta(filePath, newCounts);
		if (delta === undefined) return;

		const currentAdded = cur.days[cur.today]?.[filePath];
		// Live-delta semantics: the stored value tracks the editor's
		// current position relative to today's baseline — it can go
		// negative when the file shrinks below the morning snapshot, so
		// deletions stay visible instead of freezing the number.  A zero
		// delta removes the row (back at baseline == no net words today),
		// keeping the day map free of 0-word litter.
		if (delta.w === 0 && delta.c === 0) {
			if (currentAdded) {
				cur.deleteActivity(cur.today, filePath);
			}
		} else if (
			!currentAdded ||
			currentAdded.w !== delta.w ||
			currentAdded.c !== delta.c
		) {
			cur.upsertAdded(cur.today, filePath, delta);
		}
	} catch (error) {
		console.error("KTR failed sampling", filePath, error);
	}
}

/* ─────────────────────────────────────────────────────────────────────────
 * Delete confirmation — a `delete` event is NOT proof that the file is gone.
 *
 * Sync clients (Nutstore, iCloud, Dropbox …) and some editors implement
 * "replace" as delete-then-recreate, and OS-level eviction on mobile can
 * empty a vault entry transiently.  Acting on the raw event would drop
 * today's row AND its baseline, and the 2s persistence debounce would then
 * write that drop to disk — a transient delete turning into permanent loss
 * of the file's accumulated words for the day.  So the vault is asked once
 * more, after a short grace period, whether the file really is gone.
 *
 * No create/rename listener is needed: this single existence check is the
 * source of truth, and a re-created file is simply still (or again) present.
 * ────────────────────────────────────────────────────────────────────── */

const DELETE_CONFIRM_MS = 2000;

/**
 * filePath → pending confirmation timer.  A repeated delete event for the
 * same path keeps the first timer: only the file's final state matters, so
 * the deadline never needs to be pushed back.
 */
const pendingDeletes = new Map<string, number>();

function confirmDelete(filePath: string) {
	try {
		const st = store();
		// When "ignore deleted files" is on, deleting a file must not
		// subtract its words/chars from the day's totals — the row is kept.
		// Checked at confirmation time so a setting toggled during the grace
		// period is honoured.
		if (st.settings.ignoreDeletedFiles) return;
		// Re-created in the meantime (sync delete-then-add, editor move,
		// iCloud eviction) — the row and baseline must survive.
		if (getPlugin().app.vault.getAbstractFileByPath(filePath)) return;
		st.deleteActivity(st.today, filePath);
	} catch (error) {
		console.error("KTR failed deleting", filePath, error);
	}
}

export function handleFileDelete(file: TFile) {
	if (!isMarkdown(file) || !isPathTracked(file.path)) {
		return;
	}
	if (pendingDeletes.has(file.path)) return;
	pendingDeletes.set(
		file.path,
		window.setTimeout(() => {
			pendingDeletes.delete(file.path);
			confirmDelete(file.path);
		}, DELETE_CONFIRM_MS),
	);
}

export function handleFileRename(file: TFile, oldPath: string) {
	if (!isMarkdown(file)) return;

	try {
		store().renameFilePath(oldPath, file.path);
	} catch (error) {
		console.error("KTR failed renaming", file.path, error);
	}
}