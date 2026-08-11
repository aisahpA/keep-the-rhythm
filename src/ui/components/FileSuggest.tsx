import { App, AbstractInputSuggest, TFile } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
	app: App;
	inputEl: HTMLInputElement;
	private searchTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingQuery = "";

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.app = app;
		this.inputEl = inputEl;
	}

	/**
	 * Debounced suggestion search.  While the user keeps typing, only the
	 * last query within the window triggers the (potentially large-vault)
	 * file scan; intermediate keystrokes collapse into one.  Obsidian
	 * awaits the returned promise, and superseded searches are dropped
	 * because their timers are cancelled before they fire.
	 */
	getSuggestions(query: string): Promise<TFile[]> {
		this.pendingQuery = query;
		return new Promise<TFile[]>((resolve) => {
			if (this.searchTimer) clearTimeout(this.searchTimer);
			this.searchTimer = setTimeout(() => {
				this.searchTimer = null;
				resolve(this.runSearch(this.pendingQuery));
			}, 250);
		});
	}

	private runSearch(query: string): TFile[] {
		if (!query.trim()) return [];
		const queryLower = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path.toLowerCase().includes(queryLower))
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 50);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile) {
		this.inputEl.value = file.path;
		this.inputEl.trigger("input");
		this.close();
	}
}
