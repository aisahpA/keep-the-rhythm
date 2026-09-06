import assert from "node:assert";
import { Language } from "@/defs/types";
import {
	createRegex,
	getCharCount,
	getWordCount,
} from "@/core/wordCounting";

const LATIN = ["LATIN"] as Language[];
const LATIN_CJK = ["LATIN", "CJK"] as Language[];

function main() {
	const words = (text: string, langs: Language[] = LATIN) =>
		getWordCount(text, createRegex(langs));

	// ─── Basic counting ───
	assert.strictEqual(words(""), 0);
	assert.strictEqual(words("   "), 0);
	assert.strictEqual(words("hello world"), 2);
	assert.strictEqual(words("Hello, world!"), 2);
	assert.strictEqual(words("don't mother-in-law snake_case e.g. Ph.D."), 5);

	// ─── Char-based scripts ───
	assert.strictEqual(words("你好世界", LATIN_CJK), 4);
	assert.strictEqual(words("中文 hello", LATIN_CJK), 3);

	// ─── URL / email are one word ───
	assert.strictEqual(words("visit https://example.com/path?a=1 now"), 3);
	assert.strictEqual(words("mail me at john.doe@example.com please"), 5);

	// ─── Numbers with thousands separators ───
	assert.strictEqual(words("1,000,000 is big"), 3);

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
	assert.strictEqual(words("word %%(hidden comment)%% word", LATIN), 4);
	assert.strictEqual(
		getWordCount("one %%x%% two", createRegex(LATIN), {
			ignoreComments: true,
		}),
		2,
	);
	assert.strictEqual(
		getWordCount("- [ ] task\n- [x] done", createRegex(LATIN), {
			ignoreTasks: true,
		}),
		0,
	);
	// Checkbox markers are stripped even when tasks are counted.
	assert.strictEqual(words("- [ ] task"), 1);

	// ─── Char count honours ignores ───
	assert.strictEqual(getCharCount("hello"), 5);
	assert.strictEqual(
		getCharCount("one %%hidden%% two", { ignoreComments: true }),
		9,
	);

	// ─── createRegex caching ───
	assert.strictEqual(createRegex(LATIN), createRegex(LATIN));
	assert.strictEqual(createRegex(LATIN_CJK), createRegex(LATIN_CJK));
	assert.notStrictEqual(createRegex(LATIN), createRegex(LATIN_CJK));
}

main();