import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { skip } from "../../engine/serialization/field-enums";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Arrow")
export class ArrowComponent {
	damage: number;
	speed: number;
	fade: Seconds;
	stuckLifetime: Seconds;
	aimAngle: number;
	@skip() launched: boolean;
	@skip() stuck: boolean;
	@skip() stuckRemaining: Seconds;
	@skip() attachedTo: EntityId | null;
	@skip() attachOffsetX: number;
	@skip() attachOffsetY: number;

	constructor(
		damage: number = 25,
		speed: number = 360,
		fade: Seconds = 1 as Seconds,
		stuckLifetime: Seconds = 4 as Seconds,
		aimAngle = 0,
		launched = false,
		stuck = false,
		stuckRemaining: Seconds = 0 as Seconds,
		attachedTo = null,
		attachOffsetX = 0,
		attachOffsetY = 0,
	) {
		this.damage = damage;
		this.speed = speed;
		this.fade = fade;
		this.stuckLifetime = stuckLifetime;
		this.aimAngle = aimAngle;
		this.launched = launched;
		this.stuck = stuck;
		this.stuckRemaining = stuckRemaining;
		this.attachedTo = attachedTo;
		this.attachOffsetX = attachOffsetX;
		this.attachOffsetY = attachOffsetY;
	}
}
