import type { ECS, EntityId } from "../../engine/ecs";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import type Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { Layer } from "../collision";
import { FactionComponent } from "../faction/faction-component";
import { getReaction } from "../faction/reaction";
import { HealthComponent } from "../health/health-component";
import { DamageEvent } from "../events";
import { PerceptionComponent } from "../../engine/perception/perception-component";

const SUSPICION = 0.5;

export class PerceptionSystem implements UpdateSystem {
	update({ dt, ecs, world, events }: UpdateContext): void {
		const s = dt / 1000;
		const damage = events.read(DamageEvent);
		for (const [id, perception, , transform, facing] of ecs.query(
			PerceptionComponent,
			FactionComponent,
			TransformComponent,
			FacingComponent,
		)) {
			this.sight(ecs, world, id, perception, transform, facing, s);
			this.stimuli(ecs, id, perception, transform, damage);
		}
	}

	private sight(
		ecs: ECS,
		world: World,
		id: EntityId,
		perception: PerceptionComponent,
		transform: TransformComponent,
		facing: FacingComponent,
		s: number,
	): void {
		const range = perception.viewDistanceTiles * TILE_SIZE;
		const minCos = Math.cos(perception.viewAngle.radians);
		const eye = transform.position;
		let bestId: EntityId | null = null;
		let bestPos: Vector2 | null = null;
		let bestDist = Infinity;
		for (const [candId, , , candTransform] of ecs.query(
			HealthComponent,
			FactionComponent,
			TransformComponent,
		)) {
			if (candId === id) {
				continue;
			}
			if (getReaction(ecs, id, candId) !== "hostile") {
				continue;
			}
			const to = candTransform.position.clone().sub(eye);
			const dist = to.length();
			if (dist === 0 || dist > range) {
				continue;
			}
			if ((to.x * facing.dir) / dist < minCos) {
				continue;
			}
			if (this.occluded(world, eye, candTransform.position)) {
				continue;
			}
			if (dist < bestDist) {
				bestDist = dist;
				bestId = candId;
				bestPos = candTransform.position;
			}
		}

		if (bestId !== null && bestPos !== null) {
			perception.canSeeTarget = true;
			perception.targetId = bestId;
			perception.detection = Math.min(
				1,
				perception.detection + s / perception.detectTime.seconds,
			);
			perception.lastStimulusPos = bestPos.clone();
			perception.timeSinceStimulus = 0;
			perception.timeSinceSeen = 0;
			return;
		}

		perception.canSeeTarget = false;
		perception.detection = Math.max(
			0,
			perception.detection - s / perception.forgetTime.seconds,
		);
		perception.timeSinceStimulus += s;
		perception.timeSinceSeen += s;
		if (
			perception.detection === 0 &&
			perception.timeSinceStimulus > perception.forgetTime.seconds
		) {
			perception.targetId = null;
			perception.lastStimulusPos = null;
			perception.timeSinceSeen = Infinity;
		}
	}

	private stimuli(
		ecs: ECS,
		id: EntityId,
		perception: PerceptionComponent,
		transform: TransformComponent,
		damage: readonly DamageEvent[],
	): void {
		const range = perception.viewDistanceTiles * TILE_SIZE;
		for (const event of damage) {
			if (event.target !== id) {
				continue;
			}
			const source = event.source;
			const combatant =
				source !== null &&
				ecs.getComponent(source, HealthComponent) !== undefined &&
				getReaction(ecs, id, source) === "hostile";
			const sourceTransform =
				source !== null
					? ecs.getComponent(source, TransformComponent)
					: undefined;
			const origin =
				event.origin ?? sourceTransform?.position ?? null;

			if (combatant && sourceTransform) {
				const dist = sourceTransform.position.distanceTo(
					transform.position,
				);
				if (dist <= range) {
					perception.detection = 1;
					perception.targetId = source;
					perception.lastStimulusPos =
						sourceTransform.position.clone();
					perception.timeSinceStimulus = 0;
					continue;
				}
			}

			perception.detection = Math.max(
				perception.detection,
				SUSPICION,
			);
			if (origin !== null) {
				perception.lastStimulusPos = origin.clone();
			}
			perception.timeSinceStimulus = 0;
		}
	}

	private occluded(
		world: World,
		from: Vector2,
		to: Vector2,
	): boolean {
		return (
			world.raycast(
				from,
				to,
				(body) =>
					!body.isSensor && body.collisionLayer === Layer.Terrain,
			) !== null
		);
	}
}
