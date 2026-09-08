import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const tests = ["tests/wordCounting.test.ts", "tests/externalSync.test.ts"];

for (const entry of tests) {
	const outfile = `/tmp/${entry.split("/").pop().replace(".ts", "")}.cjs`;
	await build({
		entryPoints: [entry],
		bundle: true,
		platform: "node",
		alias: { "@": "./src", obsidian: "./tests/obsidian-stub.ts" },
		format: "cjs",
		outfile,
	});
	const result = spawnSync("node", [outfile], { stdio: "inherit" });
	if (result.status !== 0) process.exit(result.status ?? 1);
}
