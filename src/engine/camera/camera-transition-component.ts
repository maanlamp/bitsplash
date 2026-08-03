import { Ease } from "../animation/ease";
import { Tween } from "../animation/tween";
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
	easing?: Ease;
	followAfter?: ReadonlyArray<EntityId>;
}>;

const GLIDE_DURATION = 0.6 as Seconds;

@serializable("CameraTransition")
export class CameraTransitionComponent {
	@serialize() mode: CameraTransitionMode = "cut";
	@serialize() target: CameraTransitionTarget = "" as EntityId;
	@serialize() zoom: number | null = null;
	@serialize() fadeOut: Seconds = 0.35 as Seconds;
	@serialize() fadeIn: Seconds = 0.45 as Seconds;
	@serialize() followAfter: EntityId[] = [];

	/**
	 * The glide's clock and curve: a `0 → 1` scalar the system lerps both
	 * position and zoom by. Its timeline holds the duration and the elapsed
	 * time, so a snapshot taken mid-glide resumes rather than restarting.
	 */
	@serialize() glide = new Tween(
		0,
		1,
		GLIDE_DURATION,
		Ease.InOutCubic,
	);

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
		this.glide.retarget(
			0,
			1,
			config.duration ?? GLIDE_DURATION,
			config.easing ?? Ease.InOutCubic,
		);
		this.fadeOut = config.fadeOut ?? (0.35 as Seconds);
		this.fadeIn = config.fadeIn ?? (0.45 as Seconds);
		this.followAfter = [...(config.followAfter ?? [])];
	}
}
