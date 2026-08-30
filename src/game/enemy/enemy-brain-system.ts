import { AiStateComponent } from "../../engine/debug/ai-state-component";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import { stepMachine } from "../../engine/fsm/step-machine";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { MeleeComponent } from "../combat/melee-component";
import { HealthComponent } from "../health/health-component";
import { isDead } from "../respawn/mortal-component";
import { EnemyBrainComponent } from "./enemy-brain-component";
import {
	type EnemyCtx,
	type EnemyState,
	enemyBrainMachine,
} from "./enemy-brain-def";
import { WanderComponent } from "./wander-component";

const MAX_FLEE_FRACTION = 0.5;
const HOP_SPEED = 150;
const FLEE_DISTANCE = 6 * TILE_SIZE;
const RETREAT_DISTANCE = 4 * TILE_SIZE;
const SIGHT_GRACE = 1;
const LOOK_PERIOD = 2;
const TERRITORY_HYSTERESIS = 1.15;
const ATTACK_HYSTERESIS = 1.4;

@profiler("Enemy brain", "AI")
export class EnemyBrainSystem implements UpdateSystem {
	update({ ecs, dt }: UpdateContext): void {
		for (const [
			id,
			perception,
			brain,
			agent,
			intent,
			transform,
			health,
		] of ecs.query(
			PerceptionComponent,
			EnemyBrainComponent,
			NavAgentComponent,
			MovementIntentComponent,
			TransformComponent,
			HealthComponent,
		)) {
			this.applyEffects(ecs, id, brain);

			const state = brain.machine.current as EnemyState;
			const target =
				perception.targetId !== null
					? ecs.getComponent(perception.targetId, TransformComponent)
					: undefined;
			const targetPos = target?.position ?? null;
			const targetDead =
				perception.targetId !== null &&
				isDead(ecs, perception.targetId);
			const origin =
				ecs.getComponent(id, WanderComponent)?.origin ??
				transform.position;

			const ctx = this.computeCtx(
				perception,
				brain,
				health,
				targetDead,
				agent,
				transform,
				targetPos,
				origin,
				state,
			);
			this.actuate(
				id,
				ecs,
				state,
				perception,
				agent,
				intent,
				transform,
				targetPos,
				origin,
				brain.machine.elapsed,
			);

			const result = stepMachine(
				enemyBrainMachine,
				brain.machine,
				ctx,
				(dt / 1000) as Seconds,
			);
			brain.entered = result.entered;
			brain.exited = result.exited;

			this.mirrorState(ecs, id, brain.machine.current);
		}
	}

	private mirrorState(ecs: ECS, id: EntityId, state: string): void {
		let debug = ecs.getComponent(id, AiStateComponent);
		if (!debug) {
			debug = new AiStateComponent();
			ecs.addComponent(id, debug);
		}
		debug.state = state;
	}

	private computeCtx(
		perception: PerceptionComponent,
		brain: EnemyBrainComponent,
		health: HealthComponent,
		targetDead: boolean,
		agent: NavAgentComponent,
		transform: TransformComponent,
		targetPos: Vector2 | null,
		origin: Vector2,
		state: EnemyState,
	): EnemyCtx {
		const seen = perception.timeSinceSeen < SIGHT_GRACE;
		const provoked =
			perception.timeSinceDamage < brain.provokeDuration.seconds;
		const engaged = seen || provoked;
		const aggro = brain.aggroRangeTiles * TILE_SIZE;
		const pursuit = perception.lastStimulusPos;
		const distFromHome = pursuit
			? origin.distanceTo(pursuit)
			: Infinity;
		const fleeAt = (1 - brain.bravery) * MAX_FLEE_FRACTION;
		const attackRange = brain.attackRangeTiles * TILE_SIZE;
		const attackReach =
			state === "attack"
				? attackRange * ATTACK_HYSTERESIS
				: attackRange;

		return {
			detection: perception.detection,
			seen,
			provoked,
			engaged,
			inAttackRange:
				targetPos !== null &&
				transform.position.distanceTo(targetPos) <= attackReach,
			leftTerritory:
				!provoked && distFromHome > aggro * TERRITORY_HYSTERESIS,
			unreachableTarget: agent.status === "unreachable" && engaged,
			reachedGoal: agent.status === "arrived",
			timeSinceSeen: perception.timeSinceSeen,
			targetDead,
			lowNerve:
				health.maxHp > 0 && health.hp / health.maxHp <= fleeAt,
			forgotten:
				perception.timeSinceStimulus > perception.forgetTime.seconds,
			surpriseDuration: brain.surpriseDuration.seconds,
			searchDuration: brain.investigateDuration.seconds,
		};
	}

	private actuate(
		id: EntityId,
		ecs: ECS,
		state: EnemyState,
		perception: PerceptionComponent,
		agent: NavAgentComponent,
		intent: MovementIntentComponent,
		transform: TransformComponent,
		targetPos: Vector2 | null,
		origin: Vector2,
		elapsed: number,
	): void {
		switch (state) {
			case "patrol":
				if (agent.status !== "moving") {
					this.lookAround(intent, elapsed);
				}
				break;
			case "surprised":
				agent.target = null;
				this.face(intent, transform, perception.lastStimulusPos);
				break;
			case "chase":
				agent.target = perception.lastStimulusPos;
				this.face(intent, transform, perception.lastStimulusPos);
				break;
			case "attack":
				agent.target = null;
				this.face(intent, transform, targetPos);
				this.triggerMelee(ecs, id);
				break;
			case "search":
				agent.target = perception.lastStimulusPos;
				if (
					agent.status === "arrived" ||
					agent.status === "unreachable"
				) {
					this.lookAround(intent, elapsed);
				}
				break;
			case "retreat":
				agent.target = this.retreatPoint(
					transform,
					perception.lastStimulusPos,
					origin,
				);
				break;
			case "flee":
				agent.target = this.fleePoint(transform, targetPos, origin);
				break;
		}
	}

	/**
	 * The startle hop. The `!` that used to appear over a surprised enemy was a
	 * `DebugTagComponent`; the visible reaction is now `enemy-alert`, which
	 * `ReactionSystem` fires off the same sighting through the authored table.
	 */
	private applyEffects(
		ecs: ECS,
		id: EntityId,
		brain: EnemyBrainComponent,
	): void {
		if (brain.entered.includes("surprised")) {
			const rb = ecs.getComponent(id, PhysicsBodyComponent);
			if (rb?.body) {
				rb.body.linearVelocity = {
					x: rb.linearVelocity.x,
					y: -HOP_SPEED,
				};
			}
		}
		if (brain.entered.includes("patrol")) {
			const agent = ecs.getComponent(id, NavAgentComponent);
			if (agent) {
				agent.target = null;
			}
			const wander = ecs.getComponent(id, WanderComponent);
			if (wander) {
				wander.dwell.restart(0);
			}
		}
	}

	private face(
		intent: MovementIntentComponent,
		transform: TransformComponent,
		target: Vector2 | null,
	): void {
		if (!target) {
			return;
		}
		const dx = target.x - transform.position.x;
		if (dx !== 0) {
			intent.faceX = Math.sign(dx);
		}
	}

	private lookAround(
		intent: MovementIntentComponent,
		elapsed: number,
	): void {
		intent.faceX =
			Math.floor(elapsed / LOOK_PERIOD) % 2 === 0 ? 1 : -1;
	}

	private triggerMelee(ecs: ECS, id: EntityId): void {
		const melee = ecs.getComponent(id, MeleeComponent);
		if (melee && melee.machine.current === "idle") {
			melee.triggered = true;
		}
	}

	private fleePoint(
		transform: TransformComponent,
		targetPos: Vector2 | null,
		origin: Vector2,
	): Vector2 {
		if (!targetPos) {
			return origin;
		}
		const away = transform.position.clone().sub(targetPos);
		if (away.length() === 0) {
			return origin;
		}
		return away
			.normalize()
			.mul(FLEE_DISTANCE)
			.add(transform.position);
	}

	private retreatPoint(
		transform: TransformComponent,
		attackerPos: Vector2 | null,
		origin: Vector2,
	): Vector2 {
		if (!attackerPos) {
			return origin;
		}
		const away = transform.position.clone().sub(attackerPos);
		if (away.length() === 0) {
			return origin;
		}
		return away
			.normalize()
			.mul(RETREAT_DISTANCE)
			.add(transform.position);
	}
}
