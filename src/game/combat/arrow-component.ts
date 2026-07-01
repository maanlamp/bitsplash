import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";

@serializable("Arrow")
export class ArrowComponent {
	@serialize() damage: number;
	@serialize() speed: number;
	@serialize() fade: Seconds;
	@serialize() stuckLifetime: Seconds;
	@serialize() aimAngle: number;
	launched: boolean;
	stuck: boolean;
	stuckRemaining: Seconds;
	attachedTo: EntityId | null;
	attachOffsetX: number;
	attachOffsetY: number;

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
