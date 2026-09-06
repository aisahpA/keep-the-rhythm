import { build } from "esbuild";
import { spawnSync } from "node:child_process";

await build({
	entryPoints: ["tests/wordCounting.test.ts"],
	bundle: true,
	platform: "node",
	alias: { "@": "./src", obsidian: "./tests/obsidian-stub.ts" },
	format: "cjs",
	outfile: "/tmp/wordCounting.test.cjs",
});

const result = spawnSync("node", ["/tmp/wordCounting.test.cjs"], {
	stdio: "inherit",
});
process.exit(result.status ?? 1);