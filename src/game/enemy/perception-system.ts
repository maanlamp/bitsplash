import type { ECS, EntityId } from "../../engine/ecs";
import { FacingComponent } from "../../engine/locomotion/facing-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
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
			perception.timeSinceDamage += s;
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
		let viewId: EntityId | null = null;
		let viewPos: Vector2 | null = null;
		let viewDist = Infinity;
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
			const center = candTransform.position;
			const dist = center.distanceTo(eye);
			const { inView, visible } = this.perceive(
				ecs,
				world,
				candId,
				center,
				eye,
				facing,
				range,
				minCos,
			);
			if (inView && dist < viewDist) {
				viewDist = dist;
				viewId = candId;
				viewPos = center;
			}
			if (visible && dist < bestDist) {
				bestDist = dist;
				bestId = candId;
				bestPos = center;
			}
		}

		this.recordSamples(
			ecs,
			world,
			perception,
			viewId,
			viewPos,
			eye,
			facing,
			range,
			minCos,
		);

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

	private perceive(
		ecs: ECS,
		world: World,
		candId: EntityId,
		center: Vector2,
		eye: Vector2,
		facing: FacingComponent,
		range: number,
		minCos: number,
	): { inView: boolean; visible: boolean } {
		let inView = false;
		for (const point of this.samplePoints(ecs, candId, center)) {
			if (!this.inCone(point, eye, facing, range, minCos)) {
				continue;
			}
			inView = true;
			if (!this.occluded(world, eye, point)) {
				return { inView: true, visible: true };
			}
		}
		return { inView, visible: false };
	}

	private samplePoints(
		ecs: ECS,
		candId: EntityId,
		center: Vector2,
	): Vector2[] {
		const body = ecs.getComponent(candId, PhysicsBodyComponent);
		const halfHeight = body ? body.halfHeight : 0;
		return [
			center,
			new Vector2(center.x, center.y - halfHeight),
			new Vector2(center.x, center.y + halfHeight),
		];
	}

	private inCone(
		point: Vector2,
		eye: Vector2,
		facing: FacingComponent,
		range: number,
		minCos: number,
	): boolean {
		const to = point.clone().sub(eye);
		const dist = to.length();
		if (dist === 0 || dist > range) {
			return false;
		}
		return (to.x * facing.dir) / dist >= minCos;
	}

	private recordSamples(
		ecs: ECS,
		world: World,
		perception: PerceptionComponent,
		candId: EntityId | null,
		center: Vector2 | null,
		eye: Vector2,
		facing: FacingComponent,
		range: number,
		minCos: number,
	): void {
		perception.sightSamples.length = 0;
		if (candId === null || center === null) {
			return;
		}
		for (const point of this.samplePoints(ecs, candId, center)) {
			if (!this.inCone(point, eye, facing, range, minCos)) {
				continue;
			}
			perception.sightSamples.push({
				x: point.x,
				y: point.y,
				blocked: this.occluded(world, eye, point),
			});
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
			if (event.target !== id || event.source === null) {
				continue;
			}
			const source = event.source;
			if (getReaction(ecs, id, source) !== "hostile") {
				continue;
			}
			if (ecs.getComponent(source, HealthComponent) === undefined) {
				continue;
			}
			const sourceTransform = ecs.getComponent(
				source,
				TransformComponent,
			);
			const attackerPos = sourceTransform?.position ?? event.origin;
			const dist = sourceTransform
				? sourceTransform.position.distanceTo(transform.position)
				: Infinity;

			perception.targetId = source;
			perception.timeSinceStimulus = 0;
			perception.timeSinceDamage = 0;
			if (attackerPos !== null) {
				perception.lastStimulusPos = attackerPos.clone();
			}
			perception.detection =
				dist <= range ? 1 : Math.max(perception.detection, SUSPICION);
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
