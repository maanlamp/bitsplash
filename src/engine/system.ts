import type AssetManager from "./assets";
import type AudioManager from "./audio/audio";
import type { Time } from "./clock";
import type { Milliseconds } from "./duration";
import type { ECS, ReadonlyECS } from "./ecs";
import type EventBus from "./events";
import type { Input } from "./input/input";
import type Renderer2D from "./renderer-2d";
import type { World } from "./world";

export type UpdateContext = Readonly<{
	dt: Milliseconds;
	time: Time;
	ecs: ECS;
	world: World;
	input: Input;
	assetManager: AssetManager;
	events: EventBus;
	audio: AudioManager;
}>;

export type RenderContext = Readonly<{
	renderer: Renderer2D;
	time: Time;
	ecs: ReadonlyECS;
	input: Input;
	assetManager: AssetManager;
}>;

export abstract class UpdateSystem {
	abstract update(ctx: UpdateContext): void;
}

export abstract class RenderSystem {
	abstract render(ctx: RenderContext): void;
}
