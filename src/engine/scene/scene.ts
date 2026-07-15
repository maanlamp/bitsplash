import { Color } from "../color";
import type { ECS } from "../ecs";
import { deserializeWorld } from "../serialization/deserialize";
import type { SerializedWorld } from "../serialization/registry";
import type { ActionProvider } from "../input/bindings/action-provider";
import type { GlobalServices } from "../services";
import type { UiRuntime } from "../ui/ui-runtime";
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
	actions?: ActionProvider;
	ui?: UiRuntime | null;
	defaultEntity?: (position: Vector2) => ReadonlyArray<object>;
	migrateFile?: (file: SceneFile, sceneId: string) => SceneFile;
}>;

export class Scene {
	readonly kind: string;
	readonly name: string;
	readonly config: SceneConfig;
	readonly world: World;
	readonly actions: ActionProvider | null;
	readonly ui: UiRuntime | null;

	private readonly makeDefaultEntity?: (
		position: Vector2,
	) => ReadonlyArray<object>;
	private readonly migrate?: (
		file: SceneFile,
		sceneId: string,
	) => SceneFile;

	constructor(params: SceneParams) {
		this.kind = params.kind;
		this.name = params.name;
		this.config = params.config;
		this.world = params.world;
		this.actions = params.actions ?? null;
		this.ui = params.ui ?? null;
		this.makeDefaultEntity = params.defaultEntity;
		this.migrate = params.migrateFile;
	}

	/**
	 * Apply this scene's authored-data migration to a raw {@link SceneFile},
	 * returning a new file. Pure: never touches the live world. Returns the
	 * input unchanged when the scene declares no migration or it does not apply.
	 */
	migrateFile(file: SceneFile, sceneId: string): SceneFile {
		return this.migrate?.(file, sceneId) ?? file;
	}

	get ecs(): ECS {
		return this.world.ecs;
	}

	defaultEntity(position: Vector2): ReadonlyArray<object> {
		return this.makeDefaultEntity?.(position) ?? [];
	}

	/**
	 * Reset the live world to an authored snapshot: clear it and re-deserialize.
	 * Used by the edit document to rebuild its projection from the baseline
	 * ({@link SceneDocument.rebuildLive}); never serializes a live world.
	 */
	restore(snapshot: SerializedWorld): void {
		this.world.clear();
		deserializeWorld(this.world, snapshot);
	}
}
