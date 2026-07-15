import { registerSceneFile } from "../engine/scene/registry";
import type { SceneFile } from "../engine/scene/scene";
import "./register-prefabs";
import "./sequence/sequence-manifest";

/**
 * All load-bearing registration side-effects for the game, in one place,
 * imported by both entrypoints (`main.tsx`, `game-main.tsx`).
 *
 * Deserialization and prefab spawning fail *silently* on a missing
 * registration (an unknown component is skipped, an unknown prefab yields
 * `null`), so a scene that boots without this module looks empty rather than
 * erroring. Keep every registration glob here; `test/game-composition-boot.test.ts`
 * pins that the real boot path spawns the player and a known prefab.
 */

import.meta.glob(
	["../engine/**/*-component.ts", "./*/*-component.ts"],
	{ eager: true },
);

import.meta.glob("./*/*-def.ts", { eager: true });

const sceneFileModules = import.meta.glob(
	"./content/levels/*.scene.json",
	{ eager: true },
);

/**
 * Every committed scene file, keyed by scene id (filename without the
 * `.scene.json` suffix). The game resolves scenes from this map; the editor
 * registry is populated with the same files below.
 */
export const sceneFiles = new Map<string, SceneFile>();

for (const [path, mod] of Object.entries(sceneFileModules)) {
	const id = path
		.split("/")
		.pop()!
		.replace(/\.scene\.json$/, "");
	const file = (mod as { default: SceneFile }).default;
	sceneFiles.set(id, file);
	registerSceneFile(id, file);
}
