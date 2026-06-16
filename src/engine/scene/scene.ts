import type { ECS } from "../ecs";
import { deserializeWorld } from "../serialization/deserialize";
import type { SerializedWorld } from "../serialization/registry";
import { serializeWorld } from "../serialization/serialize";
import type { GlobalServices } from "../services";
import type { UpdateSystem } from "../system";
import type { TileGrid } from "../tilemap/grid";
import type Vector2 from "../vector2";
import type { World } from "../world";

export type SceneConfig = Readonly<{
	gravity: Readonly<{ x: number; y: number }>;
	uiScale?: number;
	tileset?: string;
}>;

export type SceneTileRect = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type SceneFile = Readonly<{
	version: number;
	kind: string;
	name?: string;
	config: SceneConfig;
	tiles: ReadonlyArray<SceneTileRect>;
	entities: SerializedWorld;
}>;

export type SceneBuildContext = Readonly<{
	config: SceneConfig;
	name: string;
	services: GlobalServices;
}>;

export type SceneFactory = (ctx: SceneBuildContext) => Scene;

export type SceneParams = Readonly<{
	kind: string;
	name: string;
	config: SceneConfig;
	world: World;
	tileGrid?: TileGrid;
	gameplaySystems: ReadonlyArray<UpdateSystem>;
	spawnRuntimeEntities?: () => void;
	defaultEntity?: (position: Vector2) => ReadonlyArray<object>;
}>;

export class Scene {
	readonly kind: string;
	readonly name: string;
	readonly config: SceneConfig;
	readonly world: World;
	readonly tileGrid?: TileGrid;

	private readonly gameplaySystems: ReadonlyArray<UpdateSystem>;
	private readonly spawnRuntime?: () => void;
	private readonly makeDefaultEntity?: (
		position: Vector2,
	) => ReadonlyArray<object>;

	private simulating = false;
	private snapshot: SerializedWorld | null = null;

	constructor(params: SceneParams) {
		this.kind = params.kind;
		this.name = params.name;
		this.config = params.config;
		this.world = params.world;
		this.tileGrid = params.tileGrid;
		this.gameplaySystems = params.gameplaySystems;
		this.spawnRuntime = params.spawnRuntimeEntities;
		this.makeDefaultEntity = params.defaultEntity;
	}

	get ecs(): ECS {
		return this.world.ecs;
	}

	get isSimulating(): boolean {
		return this.simulating;
	}

	defaultEntity(position: Vector2): ReadonlyArray<object> {
		return this.makeDefaultEntity?.(position) ?? [];
	}

	setSimulating(enabled: boolean): void {
		if (enabled === this.simulating) {
			return;
		}
		this.simulating = enabled;
		if (enabled) {
			this.snapshot = serializeWorld(this.world.ecs);
			for (const system of this.gameplaySystems) {
				this.world.ecs.addUpdateSystem(system);
			}
			this.spawnRuntime?.();
		} else {
			for (const system of this.gameplaySystems) {
				this.world.ecs.removeUpdateSystem(system);
			}
			if (this.snapshot) {
				this.restore(this.snapshot);
				this.snapshot = null;
			}
		}
	}

	restore(snapshot: SerializedWorld): void {
		this.world.clear();
		deserializeWorld(this.world, snapshot);
	}
}
