import type { Body } from "planck";
import { RigidbodyComponent } from "../../engine/components/rigidbody";
import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import type { EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TILE_SIZE } from "../../engine/tile";
import type { TileGrid } from "../../engine/tilemap/grid";
import Vector2 from "../../engine/vector2";
import type { World } from "../../engine/world";
import { ArrowComponent } from "../components/arrow";
import { HealthComponent } from "../components/health";
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
		const seconds = dt / 1000;
		for (const [id, arrow, transform, rb, sprite] of ecs.query(
			ArrowComponent,
			TransformComponent,
			RigidbodyComponent,
			SpriteComponent,
		)) {
			if (!arrow.launched) {
				rb.linearVelocity = Vector2.fromAngle(arrow.aimAngle).mul(
					arrow.speed,
				);
				rb.body.setAngle(arrow.aimAngle);
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
					rb.body.setTransform({ x, y }, rb.body.getAngle());
				}
				arrow.stuckRemaining -= seconds;
				sprite.opacity = fadeAlpha(arrow.stuckRemaining, arrow.fade);
				if (arrow.stuckRemaining <= 0) {
					world.despawn(id);
				}
				continue;
			}

			if (this.outOfBounds(transform.position)) {
				world.despawn(id);
				continue;
			}

			const velocity = rb.linearVelocity;
			const speed = velocity.length();
			if (speed <= 0.01) {
				continue;
			}
			const direction = velocity.clone().div(speed);
			rb.body.setAngle(direction.angle());

			const reach = speed * seconds + ARROW_REACH;
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
				const victim = hit.body.getUserData() as EntityId | null;
				this.stick(arrow, rb, hit.point, direction, victim);
				if (victim) {
					const host = ecs.getComponent(victim, TransformComponent);
					if (host) {
						const stuckPos = rb.body.getPosition();
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
		rb: RigidbodyComponent,
		point: Vector2,
		direction: Vector2,
		attachedTo: EntityId | null,
	): void {
		arrow.stuck = true;
		arrow.attachedTo = attachedTo;
		arrow.stuckRemaining = arrow.stuckLifetime;
		const center = point
			.clone()
			.sub(direction.clone().mul(ARROW_REACH - EMBED_DEPTH));
		rb.body.setTransform(
			{ x: center.x, y: center.y },
			direction.angle(),
		);
		rb.body.setLinearVelocity({ x: 0, y: 0 });
		rb.body.setAngularVelocity(0);
		rb.body.setStatic();
	}

	private resume(
		arrow: ArrowComponent,
		rb: RigidbodyComponent,
		sprite: SpriteComponent,
	): void {
		arrow.stuck = false;
		arrow.attachedTo = null;
		sprite.opacity = 1;
		rb.body.setDynamic();
		rb.body.setAwake(true);
	}

	private raycast(
		world: World,
		self: Body,
		from: Vector2,
		to: Vector2,
	): { point: Vector2; body: Body } | null {
		let result: { point: Vector2; body: Body } | null = null;
		world.physics.rayCast(
			{ x: from.x, y: from.y },
			{ x: to.x, y: to.y },
			(fixture, point, _normal, fraction) => {
				const body = fixture.getBody();
				if (body === self || fixture.getFilterGroupIndex() < 0) {
					return -1;
				}
				result = { point: new Vector2(point.x, point.y), body };
				return fraction;
			},
		);
		return result;
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
