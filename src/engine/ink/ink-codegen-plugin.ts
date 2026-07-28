import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/**
 * The content generators, in the same order `bun run gen` runs them. Most emit
 * gitignored `*.gen.ts` modules the app imports, so a checkout that has never run
 * `bun run gen` still resolves as long as this plugin runs first; the order also
 * matters because `gen-assets.ts` scans the asset directory that
 * `gen-bubble-sprite.ts` writes into.
 */
const SCRIPTS = [
	"gen-ink.ts",
	"gen-bubble-sprite.ts",
	"gen-emotion-icons.ts",
	"gen-assets.ts",
].map((name) =>
	fileURLToPath(new URL(`../../../scripts/${name}`, import.meta.url)),
);

const runCodegen = (): void => {
	for (const script of SCRIPTS) {
		const result = spawnSync("bun", ["run", script], {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		if (result.status !== 0) {
			throw new Error(
				`${script} failed (exit ${result.status ?? "unknown"})`,
			);
		}
	}
};

export const inkCodegen = (): Plugin => ({
	name: "ink-codegen",
	buildStart() {
		runCodegen();
	},
	handleHotUpdate(ctx) {
		if (ctx.file.endsWith(".ink")) {
			runCodegen();
		}
	},
});
