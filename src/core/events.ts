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

async function ensureActivityExists(file: TFile, liveContent?: string) {
	if (updatingFiles.has(file.path) || isFileLive(file)) return;

	updatingFiles.add(file.path);
	try {
		await flushPendingEditorChange();
		const st = store();
		await getExistingOrCreateNewEntry(file, st.today, liveContent);
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

	// Freeze content at focus time — reading after flush would let
	// keystrokes leak into the baseline and silently swallow words.
	const liveContent = leaf.view.editor?.getValue();
	await ensureActivityExists(file, liveContent);
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
		if (baseline === undefined) return;

		const newWordCount = getLanguageBasedWordCount(
			editor.getValue(),
			cur.settings?.enabledLanguages,
		);

		// Peak delta: stored value never decreases.
		const proposed = Math.max(0, newWordCount - baseline);
		const currentAdded = cur.days[cur.today]?.[filePath] ?? 0;
		cur.upsertAdded(cur.today, filePath, Math.max(currentAdded, proposed));
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