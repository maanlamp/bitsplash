import { Color } from "../color";
import type { ECS } from "../ecs";
import { deserializeWorld } from "../serialization/deserialize";
import type { SerializedWorld } from "../serialization/registry";
import { serializeWorld } from "../serialization/serialize";
import type { GlobalServices } from "../services";
import type { UpdateContext, UpdateSystem } from "../system";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import {
	type ValueType,
	VALUE_TYPE,
} from "../serialization/serializable-value";
import Vector2 from "../vector2";
import type { World } from "../world";

export type SceneConfigData = Readonly<{
	gravity: Readonly<{ x: number; y: number }>;
	uiScale?: number;
	clearColor?: string;
}>;

@serializable("SceneConfig")
export class SceneConfig implements ValueType {
	get [VALUE_TYPE](): true {
		return true;
	}

	@serialize() gravity: Vector2 = new Vector2(0, 20);
	@serialize() uiScale = 1;
	@serialize() clearColor = new Color("transparent");
}

export const toSceneConfig = (data: SceneConfigData): SceneConfig => {
	const config = new SceneConfig();
	config.gravity = new Vector2(data.gravity.x, data.gravity.y);
	if (data.uiScale !== undefined) {
		config.uiScale = data.uiScale;
	}
	if (data.clearColor !== undefined) {
		config.clearColor = new Color(data.clearColor);
	}
	return config;
};

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
	config: SceneConfigData;
	tiles?: ReadonlyArray<SceneTileRect>;
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
	gameplaySystems: ReadonlyArray<UpdateSystem>;
	spawnRuntimeEntities?: () => void;
	defaultEntity?: (position: Vector2) => ReadonlyArray<object>;
	migrateFile?: (file: SceneFile) => void;
}>;

export class Scene {
	readonly kind: string;
	readonly name: string;
	readonly config: SceneConfig;
	readonly world: World;

	private readonly gameplaySystems: ReadonlyArray<UpdateSystem>;
	private readonly spawnRuntime?: () => void;
	private readonly makeDefaultEntity?: (
		position: Vector2,
	) => ReadonlyArray<object>;
	private readonly migrate?: (file: SceneFile) => void;

	private simulating = false;
	private paused = false;
	private snapshot: SerializedWorld | null = null;

	constructor(params: SceneParams) {
		this.kind = params.kind;
		this.name = params.name;
		this.config = params.config;
		this.world = params.world;
		this.gameplaySystems = params.gameplaySystems;
		this.spawnRuntime = params.spawnRuntimeEntities;
		this.makeDefaultEntity = params.defaultEntity;
		this.migrate = params.migrateFile;
	}

	migrateFile(file: SceneFile): void {
		this.migrate?.(file);
	}

	get ecs(): ECS {
		return this.world.ecs;
	}

	applyConfig(): void {
		this.world.setGravity(this.config.gravity);
	}

	get isSimulating(): boolean {
		return this.simulating;
	}

	get snapshotData(): SerializedWorld | null {
		return this.snapshot;
	}

	get isPaused(): boolean {
		return this.paused;
	}

	setPaused(paused: boolean): void {
		this.paused = paused;
	}

	defaultEntity(position: Vector2): ReadonlyArray<object> {
		return this.makeDefaultEntity?.(position) ?? [];
	}

	setSimulating(enabled: boolean): void {
		if (enabled === this.simulating) {
			return;
		}
		this.simulating = enabled;
		this.paused = false;
		if (enabled) {
			this.snapshot = serializeWorld(this.world.ecs);
			for (const system of this.gameplaySystems) {
				(system as { resetRuntime?: () => void }).resetRuntime?.();
			}
			this.spawnRuntime?.();
		} else if (this.snapshot) {
			this.restore(this.snapshot);
			this.snapshot = null;
		}
	}

	updateGameplay(ctx: UpdateContext): void {
		if (!this.simulating || this.paused) {
			return;
		}
		this.stepGameplay(ctx);
	}

	stepGameplay(ctx: UpdateContext): void {
		for (const system of this.gameplaySystems) {
			system.update(ctx);
		}
	}

	restore(snapshot: SerializedWorld): void {
		this.world.clear();
		deserializeWorld(this.world, snapshot);
	}
}
