import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { type HitModifiers, NO_MODIFIERS } from "./resolve-hit";

@serializable("Arrow")
export class ArrowComponent {
	@serialize() base: number;
	@serialize() critChance: number;
	@serialize() critMultiplier: number;
	@serialize() flavourSet: string;
	@serialize() speed: number;
	@serialize() fade: Seconds;
	@serialize() stuckLifetime: Seconds;
	@serialize() aimAngle: number;
	mods: HitModifiers;
	launched: boolean;
	stuck: boolean;
	stuckRemaining: Seconds;
	attachedTo: EntityId | null;
	attachOffsetX: number;
	attachOffsetY: number;

	constructor(
		base: number = 25,
		critChance: number = 0,
		critMultiplier: number = 2,
		flavourSet: string = "arrow",
		speed: number = 360,
		fade: Seconds = 1 as Seconds,
		stuckLifetime: Seconds = 4 as Seconds,
		aimAngle = 0,
		mods: HitModifiers = NO_MODIFIERS,
		launched = false,
		stuck = false,
		stuckRemaining: Seconds = 0 as Seconds,
		attachedTo = null,
		attachOffsetX = 0,
		attachOffsetY = 0,
	) {
		this.base = base;
		this.critChance = critChance;
		this.critMultiplier = critMultiplier;
		this.flavourSet = flavourSet;
		this.speed = speed;
		this.fade = fade;
		this.stuckLifetime = stuckLifetime;
		this.aimAngle = aimAngle;
		this.mods = mods;
		this.launched = launched;
		this.stuck = stuck;
		this.stuckRemaining = stuckRemaining;
		this.attachedTo = attachedTo;
		this.attachOffsetX = attachOffsetX;
		this.attachOffsetY = attachOffsetY;
	}
}
