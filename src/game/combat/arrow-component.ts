import Angle from "../../engine/angle";
import { Timeline } from "../../engine/animation/timeline";
import { Duration } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { EntityRef } from "../../engine/entity-ref";
import { Percent } from "../../engine/percent";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import { type HitModifiers, NO_MODIFIERS } from "./resolve-hit";

@serializable("Arrow")
export class ArrowComponent {
	@serialize() base: number;
	@serialize({ group: "crit" }) critChance: Percent;
	@serialize({ group: "crit" }) critMultiplier: number;
	@serialize() flavourSet: string;
	@serialize({ group: "motion" }) speed: number;
	@serialize({ group: "lifetime" }) fade: Duration;
	@serialize({ group: "lifetime" }) stuckLifetime: Duration;
	@serialize({ group: "motion" }) aimAngle: Angle;
	mods: HitModifiers;
	@serialize() launched: boolean;
	@serialize() stuck: boolean;
	/**
	 * Countdown an embedded arrow lives out before it is removed, ticked in
	 * seconds by `ArrowSystem`. Retimed to {@link stuckLifetime} on every stick.
	 */
	@serialize() stuckLife = new Timeline();
	@serialize() attachedTo: EntityRef;
	@serialize() attachOffsetX: number;
	@serialize() attachOffsetY: number;

	constructor(
		base: number = 25,
		critChance: number = 0,
		critMultiplier: number = 2,
		flavourSet: string = "arrow",
		speed: number = 360,
		fade: number = 1,
		stuckLifetime: number = 4,
		aimAngle = 0,
		mods: HitModifiers = NO_MODIFIERS,
		launched = false,
		stuck = false,
		attachedTo: EntityId | null = null,
		attachOffsetX = 0,
		attachOffsetY = 0,
	) {
		this.base = base;
		this.critChance = new Percent(critChance);
		this.critMultiplier = critMultiplier;
		this.flavourSet = flavourSet;
		this.speed = speed;
		this.fade = new Duration(fade);
		this.stuckLifetime = new Duration(stuckLifetime);
		this.aimAngle = new Angle(aimAngle);
		this.mods = mods;
		this.launched = launched;
		this.stuck = stuck;
		this.attachedTo = new EntityRef(attachedTo);
		this.attachOffsetX = attachOffsetX;
		this.attachOffsetY = attachOffsetY;
	}
}
