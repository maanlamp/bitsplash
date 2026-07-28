import { readFileSync } from "node:fs";
import { Glob } from "bun";
import type { Story } from "inkjs/full";
import { compileStory } from "../../src/engine/ink/story";

/**
 * The externals `ink-bindings.ts` binds in the game. `main.ink` declares them
 * and inkjs validates every binding on the first `Continue`, so a headless story
 * must stub them even when nothing under test calls one.
 */
const EXTERNALS = [
	"start_quest",
	"advance_quest",
	"decline_quest",
	"give_item",
	"start_cutscene",
] as const;

/**
 * Compiles the real committed dialogue from disk — the artifact, not a fixture
 * string — so a test asserting on a bark line fails when the authored line
 * changes.
 *
 * `ink-loader`'s `import.meta.glob` yields nothing under `bun test`, so the
 * sources are read straight off the filesystem.
 *
 * @example
 * const ink = new InkStoryComponent();
 * ink.story = committedStory();
 */
export const committedStory = (): Story => {
	const sources: Record<string, string> = {};
	for (const path of new Glob(
		"src/game/content/dialogue/**/*.ink",
	).scanSync(".")) {
		const name = path.split(/[/\\]/).pop()!;
		sources[name] = readFileSync(path, "utf8");
	}
	const compiled = compileStory(sources, "main.ink");
	for (const name of EXTERNALS) {
		compiled.BindExternalFunction(name, () => 0, false);
	}
	return compiled;
};
