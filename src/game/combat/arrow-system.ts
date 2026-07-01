import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import type { RaycastHit } from "../../engine/physics/physics";
import type { RigidBody } from "../../engine/physics/rigid-body";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { Layer } from "../collision";
import { ArrowComponent } from "../combat/arrow-component";
import { HealthComponent } from "../health/health-component";
import { DamageEvent } from "../events";
import { fadeAlpha } from "../fade";

const BOUNDS_MARGIN = 4 * TILE_SIZE;
const ARROW_REACH = 8;
const EMBED_DEPTH = 4;

export class ArrowSystem implements UpdateSystem {
	private tileGrid: TileGrid;

	constructor(tileGrid: TileGrid) {
		this.tileGrid = tileGrid;
	}

	update({ dt, ecs, world, events }: UpdateContext): void {
		const dtSeconds = (dt / 1000) as Seconds;
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
				rb.linearVelocity = Vector2.fromAngle(arrow.aimAngle).mul(
					arrow.speed,
				);
				rb.body.angle = arrow.aimAngle;
				arrow.launched = true;
				continue;
			}

			if (arrow.stuck) {
				if (arrow.attachedTo) {
					const host = ecs.getComponent(
						arrow.attachedTo,
						TransformComponent,
					);
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
				sprite.opacity = fadeAlpha(arrow.stuckRemaining, arrow.fade);
				if (arrow.stuckRemaining <= 0) {
					world.scheduleDespawn(id);
				}
				continue;
			}

			if (this.outOfBounds(transform.position)) {
				world.scheduleDespawn(id);
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
						events.emit(new DamageEvent(victim, arrow.damage));
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
		arrow.attachedTo = attachedTo;
		arrow.stuckRemaining = arrow.stuckLifetime;
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
	}

	private resume(
		arrow: ArrowComponent,
		rb: PhysicsBodyComponent,
		sprite: SpriteComponent,
	): void {
		arrow.stuck = false;
		arrow.attachedTo = null;
		sprite.opacity = 1;
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

	private outOfBounds(position: Vector2): boolean {
		const gb = this.tileGrid.bounds();
		if (!gb) {
			return false;
		}
		const minX = gb.minX * TILE_SIZE - BOUNDS_MARGIN;
		const minY = gb.minY * TILE_SIZE - BOUNDS_MARGIN;
		const maxX = (gb.maxX + 1) * TILE_SIZE + BOUNDS_MARGIN;
		const maxY = (gb.maxY + 1) * TILE_SIZE + BOUNDS_MARGIN;
		return (
			position.x < minX ||
			position.x > maxX ||
			position.y < minY ||
			position.y > maxY
		);
	}
}
