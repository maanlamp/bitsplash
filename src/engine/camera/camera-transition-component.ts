import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import type { EffectHandle } from "../effect-handle";
import type Vector2 from "../vector2";

export type CameraTransitionMode = "glide" | "cut";

export type CameraTransitionTarget = EntityId | Vector2;

export type CameraTransitionConfig = Readonly<{
	target: CameraTransitionTarget;
	mode: CameraTransitionMode;
	zoom?: number;
	duration?: Seconds;
	fadeOut?: Seconds;
	fadeIn?: Seconds;
	easing?: string;
	followAfter?: ReadonlyArray<EntityId>;
}>;

export class CameraTransitionComponent {
	mode: CameraTransitionMode;
	target: CameraTransitionTarget;
	zoom: number | null;
	duration: Seconds;
	fadeOut: Seconds;
	fadeIn: Seconds;
	easing: string;
	followAfter: EntityId[];

	elapsed = 0 as Seconds;
	fromPosition: Vector2 | null = null;
	fromZoom = 0;
	phase: "glide" | "out" | "in" = "glide";
	fade: EffectHandle | null = null;

	constructor(config: CameraTransitionConfig) {
		this.mode = config.mode;
		this.target = config.target;
		this.zoom = config.zoom ?? null;
		this.duration = config.duration ?? (0.6 as Seconds);
		this.fadeOut = config.fadeOut ?? (0.35 as Seconds);
		this.fadeIn = config.fadeIn ?? (0.45 as Seconds);
		this.easing = config.easing ?? "easeInOutCubic";
		this.followAfter = [...(config.followAfter ?? [])];
	}
}
