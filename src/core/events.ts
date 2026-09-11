import { useStore } from "./store";
import {
	TFile,
	Editor,
	WorkspaceLeaf,
	MarkdownView,
	debounce,
	type MarkdownFileInfo,
} from "obsidian";
import { getCountsFromContent } from "@/core/baselines";
import { getExistingOrCreateNewEntry } from "@/core/dataQueries";
import { computeLiveDelta, isFileLive } from "@/core/baselines";
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
		const newCounts = getCountsFromContent(editor.getValue());

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

export function handleFileDelete(file: TFile) {
	if (!isMarkdown(file) || !isPathTracked(file.path)) {
		return;
	}
	try {
		const st = store();
		// When "ignore deleted files" is on, deleting a file must not
		// subtract its words/chars from the day's totals — the row is kept.
		if (st.settings.ignoreDeletedFiles) return;
		st.deleteActivity(st.today, file.path);
	} catch (error) {
		console.error("KTR failed deleting", file.path, error);
	}
}

export function handleFileRename(file: TFile, oldPath: string) {
	if (!isMarkdown(file)) return;

	try {
		store().renameFilePath(oldPath, file.path);
	} catch (error) {
		console.error("KTR failed renaming", file.path, error);
	}
}