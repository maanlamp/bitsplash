import type AssetManager from "../assets";
import type AudioManager from "../audio/audio";
import type { ECS } from "../ecs";
import type EventBus from "../events";
import type { UpdateContext } from "../system";
import type { World } from "../world";

export type CutsceneContext = Readonly<{
	ecs: ECS;
	world: World;
	events: EventBus;
	assetManager: AssetManager;
	audio: AudioManager;
}>;

export type CutsceneWait = Readonly<{
	done(ctx: UpdateContext): boolean;
	complete(ctx: UpdateContext): void;
}>;

export type CutsceneScene = (
	ctx: CutsceneContext,
) => Generator<CutsceneWait, void, unknown>;

export type CutsceneDef = Readonly<{
	id: string;
	scenes: ReadonlyArray<CutsceneScene>;
}>;
