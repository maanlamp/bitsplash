import type AssetManager from "./assets";
import type { AudioApi } from "./audio/audio-api";
import type { Camera2D } from "./camera/camera-2d";
import type { Time } from "./clock";
import type { Milliseconds } from "./duration";
import type { ECS, ReadonlyECS } from "./ecs";
import type EventBus from "./events";
import type { ActionsApi } from "./input/bindings/actions-api";
import type { DeviceSnapshot } from "./input/device-snapshot";
import type { Input } from "./input/input";
import type Renderer2D from "./render/renderer-2d";
import type { World } from "./world";

export type UpdateContext = Readonly<{
	dt: Milliseconds;
	time: Time;
	ecs: ECS;
	world: World;
	input: DeviceSnapshot;
	actions: ActionsApi;
	assetManager: AssetManager;
	events: EventBus;
	audio: AudioApi;
	camera: Camera2D | null;
}>;

export type RenderContext = Readonly<{
	renderer: Renderer2D;
	time: Time;
	ecs: ReadonlyECS;
	input: Input;
	assetManager: AssetManager;
	uiScale: number;
	camera: Camera2D | null;
}>;

export type ScreenMetrics = Readonly<{
	scale: number;
	width: number;
	height: number;
}>;

export const screenMetrics = (ctx: RenderContext): ScreenMetrics => {
	const scale = ctx.uiScale;
	return {
		scale,
		width: ctx.renderer.width / scale,
		height: ctx.renderer.height / scale,
	};
};

export abstract class UpdateSystem {
	abstract update(ctx: UpdateContext): void;
}

export abstract class RenderSystem {
	abstract render(ctx: RenderContext): void;
}
