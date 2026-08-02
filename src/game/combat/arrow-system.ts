import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { profiler } from "../../engine/profiling/profiler";
import { SpriteComponent } from "../../engine/sprite/sprite-component";
import { TransformComponent } from "../../engine/transform-component";
import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import type { RaycastHit } from "../../engine/physics/physics";
import type { RigidBody } from "../../engine/physics/rigid-body";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import type { GridBounds } from "../../engine/tilemap/grid";
import { solidBounds } from "../../engine/tilemap/occupancy";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { Layer } from "../collision";
import { ArrowComponent } from "../combat/arrow-component";
import { HealthComponent } from "../health/health-component";
import { resolveHit } from "../combat/resolve-hit";
import { DamageEvent } from "../events";
import { fadeAlpha } from "../../engine/render/color-resolver";

const BOUNDS_MARGIN = 4 * TILE_SIZE;
const ARROW_REACH = 8;
const EMBED_DEPTH = 4;
const STIMULUS_BEARING = 4 * TILE_SIZE;

@profiler("Arrow", "Combat")
export class ArrowSystem implements UpdateSystem {
	update({ dt, ecs, world, events }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
		const bounds = solidBounds(ecs);
		for (const [id, arrow, transform, rb, sprite] of ecs.query(
			ArrowComponent,
			TransformComponent,
			PhysicsBodyComponent,
			SpriteComponent,
		)) {
			if (!rb.body) {
				continue;
			}
			if (!arrow.launched) {
				rb.linearVelocity = Vector2.fromAngle(
					arrow.aimAngle.radians,
				).mul(arrow.speed);
				rb.body.angle = arrow.aimAngle.radians;
				arrow.launched = true;
				continue;
			}

			if (arrow.stuck) {
				const hostId = arrow.attachedTo.id;
				if (hostId) {
					const host = ecs.getComponent(hostId, TransformComponent);
					if (!host) {
						this.resume(arrow, rb, sprite);
						continue;
					}
					const x = host.position.x + arrow.attachOffsetX;
					const y = host.position.y + arrow.attachOffsetY;
					transform.position.set(x, y);
					rb.body.setTransform({ x, y }, rb.body.angle);
				}
				arrow.stuckRemaining = (arrow.stuckRemaining -
					dtSeconds) as Seconds;
				sprite.opacity.set(
					fadeAlpha(arrow.stuckRemaining, arrow.fade.seconds),
				);
				if (arrow.stuckRemaining <= 0) {
					ecs.destroy(id);
				}
				continue;
			}

			if (outOfBounds(bounds, transform.position)) {
				ecs.destroy(id);
				continue;
			}

			const velocity = rb.linearVelocity;
			const speed = velocity.length();
			if (speed <= 0.01) {
				continue;
			}
			const direction = velocity.clone().div(speed);
			rb.body.angle = direction.angle();

			const reach = speed * dtSeconds + ARROW_REACH;
			const target = transform.position
				.clone()
				.add(direction.clone().mul(reach));
			const hit = this.raycast(
				world,
				rb.body,
				transform.position,
				target,
			);
			if (hit) {
				const victim = hit.body.userData;
				this.stick(arrow, rb, hit.point, direction, victim);
				if (victim) {
					const host = ecs.getComponent(victim, TransformComponent);
					if (host) {
						const stuckPos = rb.body.position;
						arrow.attachOffsetX = stuckPos.x - host.position.x;
						arrow.attachOffsetY = stuckPos.y - host.position.y;
					}
					if (ecs.getComponent(victim, HealthComponent)) {
						const { amount, crit } = resolveHit(
							arrow,
							arrow.mods,
							Math.random,
						);
						const origin = hit.point
							.clone()
							.sub(direction.clone().mul(STIMULUS_BEARING));
						events.emit(
							new DamageEvent(
								victim,
								amount,
								crit,
								arrow.flavourSet,
								id,
								origin,
							),
						);
					}
				}
			}
		}
	}

	private stick(
		arrow: ArrowComponent,
		rb: PhysicsBodyComponent,
		point: Vector2,
		direction: Vector2,
		attachedTo: EntityId | null,
	): void {
		const body = rb.body!;
		arrow.stuck = true;
		arrow.attachedTo.set(attachedTo);
		arrow.stuckRemaining = arrow.stuckLifetime.seconds as Seconds;
		const center = point
			.clone()
			.sub(direction.clone().mul(ARROW_REACH - EMBED_DEPTH));
		body.setTransform(
			{ x: center.x, y: center.y },
			direction.angle(),
		);
		body.linearVelocity = { x: 0, y: 0 };
		body.setAngularVelocity(0);
		body.setBodyType("static");
		rb.type = "static";
	}

	private resume(
		arrow: ArrowComponent,
		rb: PhysicsBodyComponent,
		sprite: SpriteComponent,
	): void {
		arrow.stuck = false;
		arrow.attachedTo.set(null);
		sprite.opacity.set(1);
		rb.type = "dynamic";
		rb.body!.setBodyType("dynamic");
		rb.body!.setAwake(true);
	}

	private raycast(
		world: World,
		self: RigidBody,
		from: Vector2,
		to: Vector2,
	): RaycastHit | null {
		return world.raycast(
			{ x: from.x, y: from.y },
			{ x: to.x, y: to.y },
			(body) =>
				body !== self &&
				(body.collisionLayer === Layer.Terrain ||
					body.collisionLayer === Layer.Enemy ||
					body.collisionLayer === Layer.Crate),
		);
	}
}

/**
 * Whether an arrow has left the painted world by more than {@link BOUNDS_MARGIN}.
 *
 * The bounds are resolved once per `update()` and passed in: they are a property
 * of the tilemap, not of the arrow, and reading them per arrow was the system's
 * dominant cost.
 */
const outOfBounds = (
	bounds: GridBounds | null,
	position: Vector2,
): boolean => {
	if (!bounds) {
		return false;
	}
	const minX = bounds.minX * TILE_SIZE - BOUNDS_MARGIN;
	const minY = bounds.minY * TILE_SIZE - BOUNDS_MARGIN;
	const maxX = (bounds.maxX + 1) * TILE_SIZE + BOUNDS_MARGIN;
	const maxY = (bounds.maxY + 1) * TILE_SIZE + BOUNDS_MARGIN;
	return (
		position.x < minX ||
		position.x > maxX ||
		position.y < minY ||
		position.y > maxY
	);
};
