import type { Story } from "inkjs/full";
import { compileStory } from "../../engine/ink/story";

const MAIN = "main.ink";

let modules: Record<string, string> = {};
try {
	modules = import.meta.glob("../content/dialogue/**/*.ink", {
		query: "?raw",
		import: "default",
		eager: true,
	}) as Record<string, string>;
} catch {
	modules = {};
}

const sources: Record<string, string> = {};
for (const [path, source] of Object.entries(modules)) {
	const name = path.split("/").pop()!;
	sources[name] = source;
}

export const createStory = (): Story => compileStory(sources, MAIN);
