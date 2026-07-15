import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import type { EffectHandle } from "../effect-handle";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
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

@serializable("CameraTransition", { runtime: true })
export class CameraTransitionComponent {
	@serialize() mode: CameraTransitionMode = "cut";
	@serialize() target: CameraTransitionTarget = "" as EntityId;
	@serialize() zoom: number | null = null;
	@serialize() duration: Seconds = 0.6 as Seconds;
	@serialize() fadeOut: Seconds = 0.35 as Seconds;
	@serialize() fadeIn: Seconds = 0.45 as Seconds;
	@serialize() easing: string = "easeInOutCubic";
	@serialize() followAfter: EntityId[] = [];

	@serialize() elapsed = 0 as Seconds;
	@serialize() fromPosition: Vector2 | null = null;
	@serialize() fromZoom = 0;
	@serialize() phase: "glide" | "out" | "in" = "glide";
	fade: EffectHandle | null = null;

	constructor(
		config: CameraTransitionConfig = {
			target: "" as EntityId,
			mode: "cut",
		},
	) {
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
