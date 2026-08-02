import {
	Compiler,
	CompilerOptions,
	JsonFileHandler,
	type Story,
} from "inkjs/full";

/**
 * Compile ink sources into a story.
 *
 * This pulls in the ink **compiler**, which is several times the size of the
 * runtime and takes tens of milliseconds to run. The shipped game must never
 * reach it: `scripts/gen-ink.ts` compiles at build time and emits
 * `src/game/content/dialogue/story.gen.ts`, which the runtime loads directly.
 * Keep this module out of anything the game bundles.
 *
 * @example
 * const story = compileStory({ "main.ink": source }, "main.ink");
 */
export const compileStory = (
	sources: Record<string, string>,
	main: string,
): Story => {
	const options = new CompilerOptions(
		main,
		[],
		true,
		null,
		new JsonFileHandler(sources),
	);
	return new Compiler(sources[main] ?? "", options).Compile();
};
