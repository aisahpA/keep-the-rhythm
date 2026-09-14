/** Minimal `moment` stand-in for Node test runs; real moment is provided
 *  by the Obsidian runtime at plugin load. */
type MomentStub = {
	format: (fmt: string) => string;
	clone: () => { endOf: () => { valueOf: () => number } };
	startOf: () => { toDate: () => Date };
	toDate: () => Date;
};

const stubMoment = (input?: Date): MomentStub => {
	const d = input ? new Date(input) : new Date();
	const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	return {
		format: () => iso,
		clone: () => ({ endOf: () => ({ valueOf: () => d.getTime() }) }),
		startOf: () => ({ toDate: () => d }),
		toDate: () => d,
	};
};

export const moment = stubMoment as unknown as {
	default: typeof stubMoment;
};
moment.default = stubMoment;

export class Notice {
	constructor(public message?: string) {}
}

/** Vault-file stand-in: the code under test only reads `path` / `extension`. */
export class TFile {
	path: string;
	extension: string;
	constructor(path = "") {
		this.path = path;
		this.extension = path.split(".").pop() ?? "";
	}
}

/** Used as a type-only annotation by the event handlers under test. */
export class Editor {}
export class WorkspaceLeaf {}
export class MarkdownView {}

/**
 * Obsidian's `debounce` returns a callable that also exposes `run()` (flush
 * the pending call now).  The real delay is collapsed to one macrotask —
 * tests assert on store state, not on timing.
 */
export function debounce<T extends (...args: any[]) => any>(
	cb: T,
	_timeout: number,
	_resetTimer?: boolean,
): T & { run: () => Promise<unknown> } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastArgs: unknown[] | null = null;

	const fire = () => {
		timer = null;
		const args = lastArgs;
		lastArgs = null;
		return args ? cb(...args) : undefined;
	};

	const fn = ((...args: unknown[]) => {
		lastArgs = args;
		if (timer) clearTimeout(timer);
		timer = setTimeout(fire, 0);
	}) as T & { run: () => Promise<unknown> };

	fn.run = async () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		return lastArgs ? cb(...lastArgs) : undefined;
	};

	return fn;
}

/** Test runs are always English; i18n falls back to `en` anyway. */
export function getLanguage(): string {
	return "en";
}