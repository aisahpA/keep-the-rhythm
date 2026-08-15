import { useStore } from "./store";
import {
	TFile,
	Editor,
	WorkspaceLeaf,
	MarkdownView,
	type MarkdownFileInfo,
} from "obsidian";
import { getLanguageBasedWordCount } from "@/core/wordCounting";
import { getExistingOrCreateNewEntry } from "@/core/dataQueries";
import { isPathTracked } from "./pathFilter";

// Per-file-path guard — prevents re-entrant activity creation for the
// same file without blocking other files.  A module-level boolean would
// incorrectly intercept a different file's initialization when the user
// switches tabs while the first file's async disk read is still in flight.
const updatingFiles = new Set<string>();

let editorChangeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEditor: Editor | null = null;
type FileChangeInfo = MarkdownView | MarkdownFileInfo;
let pendingInfo: FileChangeInfo | null = null;

const store = () => useStore.getState();

function isMarkdown(file: TFile | null | undefined): file is TFile {
	return !!file && file.extension === "md";
}

// Debounce delay from settings, clamped to [500ms, +∞).
function getEditorChangeDelayMs(): number {
	const delay = store().settings.editorChangeSampleDelay ?? 2;
	return Math.max(delay, 0.5) * 1000;
}

// File is "live" iff today's baseline exists. Derived from data, so it
// naturally re-fires after midnight rollover or external sync.
function isFileLive(file: TFile): boolean {
	return store().todayBaselines[file.path] !== undefined;
}

async function ensureActivityExists(file: TFile) {
	if (updatingFiles.has(file.path) || isFileLive(file)) return;

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
	// Flush any pending sample from the previously focused leaf.
	await flushPendingEditorChange();

	if (!leaf || !(leaf.view instanceof MarkdownView)) return;
	const file = leaf.view.file;
	if (!isMarkdown(file)) return;
	if (!isPathTracked(file.path)) return;
	if (isFileLive(file) || updatingFiles.has(file.path)) return;

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

	pendingEditor = editor;
	pendingInfo = info;

	if (editorChangeTimer) clearTimeout(editorChangeTimer);
	const delayMs = getEditorChangeDelayMs();
	editorChangeTimer = setTimeout(() => {
		editorChangeTimer = null;
		void runPendingEditorChange();
	}, delayMs);
}

export async function flushPendingEditorChange(): Promise<void> {
	if (!editorChangeTimer) return;
	clearTimeout(editorChangeTimer);
	editorChangeTimer = null;
	await runPendingEditorChange();
}

async function runPendingEditorChange(): Promise<void> {
	const editor = pendingEditor;
	const info = pendingInfo;
	pendingEditor = null;
	pendingInfo = null;
	if (!editor || !info) return;

	const filePath = info.file?.path;
	if (!filePath) return;

	try {
		const cur = store();
		const baseline = cur.todayBaselines[filePath];
		if (baseline === undefined) {
			// Missing baseline — sampling cannot run.  Not an expected steady
			// state (ensureActivityExists ran before the debounced sample), so
			// log it: "no number ever appears" can mean THIS (a tracking bug /
			// dropped baseline), not just a non-positive delta.
			console.warn(
				`KTR: no today baseline for "${filePath}" — sampling skipped. ` +
					"Possible causes: the file was first touched before tracking " +
					"was enabled, an external sync dropped today's baselines, or " +
					"the editor already contained text when the plugin loaded.",
			);
			return;
		}

		const newWordCount = getLanguageBasedWordCount(
			editor.getValue(),
			cur.settings?.enabledLanguages,
		);

		const rawDelta = newWordCount - baseline;
		// Peak delta: the stored value never decreases, so a net-negative
		// sample looks like a frozen or absent number.  Log the actual
		// numbers so "delta genuinely ≤ 0" is distinguishable from a bug.
		if (rawDelta <= 0) {
			console.info(
				`KTR: "${filePath}" delta ${rawDelta.toLocaleString()} — ` +
					`baseline ${baseline.toLocaleString()} → current ` +
					`${newWordCount.toLocaleString()} — stored value unchanged.`,
			);
		}
		const proposed = Math.max(0, rawDelta);
		const currentAdded = cur.days[cur.today]?.[filePath] ?? 0;
		const nextAdded = Math.max(currentAdded, proposed);
		// Skip the upsert when the net delta is non-positive AND no row
		// exists yet: writing 0 would litter days[today] with a hidden row
		// that the UI filters out anyway.
		if (nextAdded > 0 || currentAdded > 0) {
			cur.upsertAdded(cur.today, filePath, nextAdded);
		}
	} catch (error) {
		console.error(`KTR failed sampling ${filePath} | ${error}`);
	}
}

export function handleFileDelete(file: TFile) {
	if (!isMarkdown(file) || !isPathTracked(file.path)) {
		return;
	}
	try {
		const st = store();
		st.deleteActivity(st.today, file.path);
	} catch (error) {
		console.error(`KTR failed deleting ${file.path} | ${error}`);
	}
}

export function handleFileRename(file: TFile, oldPath: string) {
	if (!isMarkdown(file)) return;

	try {
		store().renameFilePath(oldPath, file.path);
	} catch (error) {
		console.error(`KTR failed renaming ${file.path} | ${error}`);
	}
}