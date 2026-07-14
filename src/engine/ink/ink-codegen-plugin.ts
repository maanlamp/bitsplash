import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const SCRIPT = fileURLToPath(
	new URL("../../../scripts/gen-ink.ts", import.meta.url),
);

const runCodegen = (): void => {
	const result = spawnSync("bun", ["run", SCRIPT], {
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		throw new Error(
			`ink codegen failed (exit ${result.status ?? "unknown"})`,
		);
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
