import type { EntityId } from "../../engine/ecs";
import { serializable } from "../../engine/serialization/serializable";

@serializable("Arrow")
export class ArrowComponent {
	damage: number;
	speed: number;
	fade: number;
	stuckLifetime: number;
	aimAngle: number;
	launched: boolean;
	stuck: boolean;
	stuckRemaining: number;
	attachedTo: EntityId | null;
	attachOffsetX: number;
	attachOffsetY: number;

	constructor(
		damage: number = 25,
		speed: number = 360,
		fade: number = 1,
		stuckLifetime: number = 4,
		aimAngle = 0,
		launched = false,
		stuck = false,
		stuckRemaining = 0,
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
