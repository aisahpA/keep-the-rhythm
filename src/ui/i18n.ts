import { getLanguage } from "obsidian";
import { en, type En } from "./locales/en";
import { zh } from "./locales/zh";

// To add a language: create ./locales/<code>.ts typed as En and register it
// here under its ISO 639-1 code.
const dicts: Record<string, En> = { en, zh };

const dict: En = dicts[getLanguage().toLowerCase().split(/[-_]/)[0]] ?? en;

/**
 * Translate a key for the current Obsidian locale, filling `{0}`, `{1}`, ...
 * placeholders from the positional args. Unknown locales fall back to English.
 */
export function t(key: keyof En, ...args: (string | number)[]): string {
	let text = dict[key];
	args.forEach((arg, i) => {
		text = text.split(`{${i}}`).join(String(arg));
	});
	return text;
}
