import type { ECS, EntityId } from "../../engine/ecs";
import type { Seconds } from "../../engine/duration";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import type EventBus from "../../engine/events";
import { FactionComponent } from "../faction/faction-component";
import { getReaction } from "../faction/reaction";
import { HealthComponent } from "../health/health-component";
import { DamageStatsComponent } from "./damage-stats-component";
import { MeleeComponent } from "./melee-component";
import { meleeMachine } from "./melee-def";
import { stepMachine } from "../../engine/fsm/step-machine";
import { NO_MODIFIERS, resolveHit } from "./resolve-hit";
import { DamageEvent } from "../events";

@profiler("Melee", "Combat")
export class MeleeSystem implements UpdateSystem {
	update({ dt, ecs, events }: UpdateContext): void {
		for (const [id, melee, transform, facing] of ecs.query(
			MeleeComponent,
			TransformComponent,
			FacingComponent,
		)) {
			const result = stepMachine(
				meleeMachine,
				melee.machine,
				{
					triggered: melee.triggered,
					windup: melee.windup.seconds as Seconds,
					recover: melee.recover.seconds as Seconds,
				},
				(dt / 1000) as Seconds,
			);

			melee.triggered = false;

			if (result.entered.includes("recover")) {
				this.strike(ecs, events, id, melee, transform, facing);
			}
		}
	}

	private strike(
		ecs: ECS,
		events: EventBus,
		attackerId: EntityId,
		melee: MeleeComponent,
		transform: TransformComponent,
		facing: FacingComponent,
	): void {
		const stats = ecs.getComponent(attackerId, DamageStatsComponent);
		if (!stats) {
			return;
		}
		const range = melee.rangeTiles * TILE_SIZE;
		const origin = transform.position;
		for (const [candId, , , candTransform] of ecs.query(
			HealthComponent,
			FactionComponent,
			TransformComponent,
		)) {
			if (candId === attackerId) {
				continue;
			}
			if (getReaction(ecs, attackerId, candId) !== "hostile") {
				continue;
			}
			const dx = candTransform.position.x - origin.x;
			const dy = candTransform.position.y - origin.y;
			if (dx !== 0 && Math.sign(dx) !== facing.dir) {
				continue;
			}
			if (Math.abs(dx) > range || Math.abs(dy) > range) {
				continue;
			}
			const { amount, crit } = resolveHit(stats, NO_MODIFIERS);
			events.emit(
				new DamageEvent(
					candId,
					amount,
					crit,
					stats.flavourSet,
					attackerId,
					origin.clone(),
					origin.clone(),
				),
			);
			const rb = ecs.getComponent(candId, PhysicsBodyComponent);
			if (rb?.body) {
				const kdir = dx === 0 ? facing.dir : Math.sign(dx);
				rb.applyImpulse(
					new Vector2(
						kdir * melee.knockback * rb.body.mass,
						-melee.knockback * 0.3 * rb.body.mass,
					),
				);
			}
		}
	}
}
