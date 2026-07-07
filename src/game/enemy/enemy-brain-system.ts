import { DebugTagComponent } from "../../engine/debug/debug-tag-component";
import type { ECS, EntityId } from "../../engine/ecs";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { MeleeComponent } from "../combat/melee-component";
import { HealthComponent } from "../health/health-component";
import { EnemyBrainComponent } from "./enemy-brain-component";
import { WanderComponent } from "./wander-component";

const MAX_FLEE_FRACTION = 0.5;
const HOP_SPEED = 150;
const FLEE_DISTANCE = 6 * TILE_SIZE;
const RETREAT_DISTANCE = 4 * TILE_SIZE;
const SIGHT_GRACE = 1;
const LOOK_PERIOD = 2;
const TERRITORY_HYSTERESIS = 1.15;
const ATTACK_HYSTERESIS = 1.4;

export class EnemyBrainSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [
			id,
			sm,
			perception,
			brain,
			agent,
			intent,
			transform,
			health,
		] of ecs.query(
			StateMachineComponent,
			PerceptionComponent,
			EnemyBrainComponent,
			NavAgentComponent,
			MovementIntentComponent,
			TransformComponent,
			HealthComponent,
		)) {
			const state = sm.current || sm.def?.initial || "patrol";
			const target =
				perception.targetId !== null
					? ecs.getComponent(perception.targetId, TransformComponent)
					: undefined;
			const targetPos = target?.position ?? null;
			const targetHealth =
				perception.targetId !== null
					? ecs.getComponent(perception.targetId, HealthComponent)
					: undefined;
			const origin =
				ecs.getComponent(id, WanderComponent)?.origin ??
				transform.position;

			this.writeParams(
				sm,
				perception,
				brain,
				health,
				targetHealth,
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
				sm.elapsed,
			);
			this.handleTransition(ecs, id, brain, state);
		}
	}

	private writeParams(
		sm: StateMachineComponent,
		perception: PerceptionComponent,
		brain: EnemyBrainComponent,
		health: HealthComponent,
		targetHealth: HealthComponent | undefined,
		agent: NavAgentComponent,
		transform: TransformComponent,
		targetPos: Vector2 | null,
		origin: Vector2,
		state: string,
	): void {
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

		const p = sm.params;
		p.detection = perception.detection;
		p.seen = seen;
		p.provoked = provoked;
		p.engaged = engaged;
		p.inAttackRange =
			targetPos !== null &&
			transform.position.distanceTo(targetPos) <= attackReach;
		p.leftTerritory =
			!provoked && distFromHome > aggro * TERRITORY_HYSTERESIS;
		p.unreachableTarget = agent.status === "unreachable" && engaged;
		p.reachedGoal = agent.status === "arrived";
		p.timeSinceSeen = perception.timeSinceSeen;
		p.targetDead =
			perception.targetId !== null &&
			(!targetHealth || targetHealth.hp <= 0);
		p.lowNerve =
			health.maxHp > 0 && health.hp / health.maxHp <= fleeAt;
		p.forgotten =
			perception.timeSinceStimulus > perception.forgetTime.seconds;
		p.state = state;
		p.surpriseDuration = brain.surpriseDuration.seconds;
		p.searchDuration = brain.investigateDuration.seconds;
	}

	private actuate(
		id: EntityId,
		ecs: ECS,
		state: string,
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
		if (melee && melee.phase === "idle") {
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

	private handleTransition(
		ecs: ECS,
		id: EntityId,
		brain: EnemyBrainComponent,
		state: string,
	): void {
		if (brain.prevState === state) {
			return;
		}
		if (state === "surprised") {
			ecs.addComponent(id, new DebugTagComponent("!"));
			const rb = ecs.getComponent(id, PhysicsBodyComponent);
			if (rb?.body) {
				rb.body.linearVelocity = {
					x: rb.linearVelocity.x,
					y: -HOP_SPEED,
				};
			}
		}
		if (brain.prevState === "surprised") {
			ecs.removeComponent(id, DebugTagComponent);
		}
		if (state === "patrol") {
			const agent = ecs.getComponent(id, NavAgentComponent);
			if (agent) {
				agent.target = null;
			}
			const wander = ecs.getComponent(id, WanderComponent);
			if (wander) {
				wander.elapsed = 0;
				wander.nextAt = 0;
			}
		}
		brain.prevState = state;
	}
}
