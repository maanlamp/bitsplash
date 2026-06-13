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
	) {
		this.damage = damage;
		this.speed = speed;
		this.fade = fade;
		this.stuckLifetime = stuckLifetime;
		this.aimAngle = 0;
		this.launched = false;
		this.stuck = false;
		this.stuckRemaining = 0;
		this.attachedTo = null;
		this.attachOffsetX = 0;
		this.attachOffsetY = 0;
	}
}
