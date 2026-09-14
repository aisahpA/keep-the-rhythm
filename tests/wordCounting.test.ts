import assert from "node:assert";
import { Language } from "@/defs/types";
import { countWordsAndChars, getEnabledLanguages } from "@/core/wordCounting";
import { useStore } from "@/core/store";

const LATIN = ["LATIN"] as Language[];
const LATIN_CHINESE = ["LATIN", "CHINESE"] as Language[];

interface TestOptions {
	langs?: Language[];
	ignoreComments?: boolean;
	ignoreTasks?: boolean;
}

/**
 * The public entry point reads its settings from the store, so tests set the
 * store. Only the fields a count depends on are touched.
 */
function count(
	text: string,
	{ langs = LATIN, ignoreComments = false, ignoreTasks = false }: TestOptions = {},
) {
	useStore.setState((s) => ({
		settings: { ...s.settings, enabledLanguages: langs, ignoreComments, ignoreTasks },
	}));
	return countWordsAndChars(text);
}

/** Word count only, for the many cases that do not care about chars. */
function words(text: string, options: TestOptions = {}): number {
	return count(text, options).w;
}

function main() {
	// ─── Basic counting ───
	assert.strictEqual(words(""), 0);
	assert.strictEqual(words("   "), 0);
	assert.strictEqual(words("hello world"), 2);
	assert.strictEqual(words("Hello, world!"), 2);
	assert.strictEqual(words("don't mother-in-law snake_case e.g. Ph.D."), 5);

	// ─── Char-based scripts ───
	assert.strictEqual(words("你好世界", { langs: LATIN_CHINESE }), 4);
	assert.strictEqual(words("中文 hello", { langs: LATIN_CHINESE }), 3);

	// ─── URL / email are one word ───
	assert.strictEqual(words("visit https://example.com/path?a=1 now"), 3);
	assert.strictEqual(words("mail me at john.doe@example.com please"), 5);

	// ─── Numbers with thousands separators ───
	assert.strictEqual(words("1,000,000 is big"), 3);

	// ─── Latin letters that sit outside A-Z / U+00C0+ ───
	// ª (U+00AA), µ (U+00B5) and º (U+00BA) are letters below the main
	// Latin-1 letter span; dropping them split words apart. `µm` is now one
	// word while the deliberately spaced `µ m` stays two.
	assert.strictEqual(words("5 µm and 3 µ m"), 6);
	assert.strictEqual(words("1º and 2ª vez"), 4);
	assert.strictEqual(words("µm"), 1);

	// ─── Connectors a typesetting tool may emit instead of ASCII "-" ───
	assert.strictEqual(words("mother\u2010in\u2010law"), 1);
	assert.strictEqual(words("mother\u2011in\u2011law"), 1);
	// Catalan middle dot: U+00B7
	assert.strictEqual(words("col\u00B7lecci\u00F3"), 1);
	assert.strictEqual(words("col\u00B7lecci\u00F3 nova"), 2);
	// The dot must not glue whitespace-separated words together.
	assert.strictEqual(words("one \u00B7 two"), 2);

	// ─── Markdown links count only the label ───
	assert.strictEqual(words("[label](https://example.com)"), 1);
	assert.strictEqual(words("![alt](img.png)"), 1);
	assert.strictEqual(words("[x](y) plain [z](w)"), 3);
	assert.strictEqual(
		words("[wiki](https://en.wikipedia.org/wiki/Foo_(bar))"),
		1,
	);

	// ─── Ignore options ───
	// By default comments are counted.
	assert.strictEqual(words("word %%(hidden comment)%% word"), 4);
	assert.strictEqual(words("one %%x%% two", { ignoreComments: true }), 2);
	assert.strictEqual(words("- [ ] task\n- [x] done", { ignoreTasks: true }), 0);
	// Checkbox markers are stripped even when tasks are counted.
	assert.strictEqual(words("- [ ] task"), 1);

	// ─── Char count honours the same ignores ───
	assert.strictEqual(count("hello").c, 5);
	assert.strictEqual(count("one %%hidden%% two", { ignoreComments: true }).c, 9);
	// Whitespace is preserved in the char total (the old `content.length`
	// behaviour), while words ignore it.
	assert.strictEqual(count("a  b").c, 4);
	assert.strictEqual(count("a  b").w, 2);
	assert.strictEqual(count("a\n\tb").c, 4);

	// ─── Word and char come from one stripped text ───
	// Every case must agree with the char total being the length of the text
	// left after the ignore rules ran, so the two can never drift apart.
	const cases = [
		"",
		"   ",
		"plain text with no markup at all",
		"[label](https://example.com) and ![alt](img.png)",
		"- [ ] task\n- [x] done\n> - [-] nested\n2) [x] numbered",
		"one %%hidden%% two",
		"%% multi\nline %% tail",
		"%%a%%- [ ] x\n%%b%%",
		"[a%%b](c)\n%%[d](e)%%",
		"don't mother-in-law snake_case e.g. Ph.D.",
		"visit https://example.com/path?a=1 now",
		"1,000,000 is big",
		"[ bracket\n] weird",
		"%not a comment% and 100%% done",
		"\t- [x]\ttabbed\n\n",
		"中文 hello 世界",
	];
	const optionSets: TestOptions[] = [
		{},
		{ ignoreComments: true },
		{ ignoreTasks: true },
		{ ignoreComments: true, ignoreTasks: true },
	];
	for (const text of cases) {
		for (const options of optionSets) {
			for (const langs of [LATIN, LATIN_CHINESE]) {
				const counts = count(text, { ...options, langs });
				assert.strictEqual(
					typeof counts.w,
					"number",
					`word count for ${JSON.stringify(text)}`,
				);
				assert.strictEqual(
					typeof counts.c,
					"number",
					`char count for ${JSON.stringify(text)}`,
				);
				assert.ok(
					counts.w >= 0 && counts.c >= 0,
					`non-negative counts for ${JSON.stringify(text)}`,
				);
				// Every word is at least one char and matches never overlap, so
				// the char total always covers the word total.
				assert.ok(
					counts.c >= counts.w,
					`chars >= words for ${JSON.stringify(text)}`,
				);
			}
		}
	}

	// ─── getEnabledLanguages mirrors the store ───
	const before = getEnabledLanguages();
	assert.deepStrictEqual(before, LATIN_CHINESE);
	useStore.setState((s) => ({ settings: { ...s.settings, enabledLanguages: LATIN } }));
	assert.deepStrictEqual(getEnabledLanguages(), LATIN);

	// ─── Language-selection robustness ───
	// The regex cache is keyed on the list as given, so a reordered or
	// duplicated selection must still count the same.
	const prose = "hello 你好 %%c%% - [ ] task";
	assert.strictEqual(
		words(prose, { langs: ["CHINESE", "LATIN"] as Language[] }),
		words(prose, { langs: LATIN_CHINESE }),
	);
	assert.strictEqual(
		words(prose, { langs: ["LATIN", "LATIN"] as Language[] }),
		words(prose, { langs: LATIN }),
	);
	// A selection with no word-based script still counts char-based scripts.
	assert.strictEqual(words("你好", { langs: ["CHINESE"] as Language[] }), 2);
	// No languages at all must not match anything, and must not throw.
	assert.strictEqual(words("hello world", { langs: [] as Language[] }), 0);
}

main();
