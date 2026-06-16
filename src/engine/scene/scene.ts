import type { Game } from "../game";
import type { SerializedWorld } from "../serialization/registry";
import type { UpdateSystem } from "../system";
import type { TileGrid } from "../tilemap/grid";
import type Vector2 from "../vector2";

export type SceneBuildContext = Readonly<{ game: Game }>;

export type SceneSetup = Readonly<{
	gameplaySystems: ReadonlyArray<UpdateSystem>;
	tileGrid?: TileGrid;
	spawnRuntimeEntities: () => void;
	restore: (snapshot: SerializedWorld) => void;
	defaultEntity?: (position: Vector2) => ReadonlyArray<object>;
}>;

export type SceneFactory = (ctx: SceneBuildContext) => SceneSetup;

export type SceneDefinition = Readonly<{
	kind: string;
	gravity: Readonly<{ x: number; y: number }>;
	uiScale?: number;
	build: SceneFactory;
}>;
