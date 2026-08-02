import type { Camera2D } from "../camera/camera-2d";
import { Camera2DComponent } from "../camera/camera-2d-component";
import { Camera2DFollowComponent } from "../camera/camera-2d-follow-component";
import { CameraFollowBorrowComponent } from "../camera/camera-follow-borrow-component";
import { CameraTransitionComponent } from "../camera/camera-transition-component";
import { PhysicsBodyComponent } from "../physics/physics-body-component";
import { TransformComponent } from "../transform-component";
import type { ECS, EntityId } from "../ecs";
import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import Vector2 from "../vector2";

/**
 * Record the gameplay follow state as borrowed by `owner`, so
 * {@link Camera2DFollowSystem} hands it back when that entity is gone. Called by
 * every sequence op that drives the camera; idempotent, and a later borrower
 * (a chained cutscene) takes over the existing snapshot rather than overwriting
 * it with an intermediate cutscene framing.
 *
 * @example
 * borrowCameraFollow(ctx.ecs, ctx.entityId); // then reframe freely
 */
export const borrowCameraFollow = (
	ecs: ECS,
	owner: EntityId,
): void => {
	const entry = ecs.queryFirst(
		Camera2DComponent,
		Camera2DFollowComponent,
	);
	if (!entry) {
		return;
	}
	const [cameraEntity, , follow] = entry;
	const existing = ecs.getComponent(
		cameraEntity,
		CameraFollowBorrowComponent,
	);
	if (existing) {
		existing.owner.set(owner);
		return;
	}
	ecs.addComponent(
		cameraEntity,
		new CameraFollowBorrowComponent(
			owner,
			follow.targets,
			follow.zoom,
		),
	);
};

const clamp = (value: number, limit: number): number =>
	Math.max(-limit, Math.min(limit, value));

const factor = (dtSeconds: number, tau: number): number =>
	tau <= 0 ? 1 : 1 - Math.exp(-dtSeconds / tau);

const deadzoned = (
	current: number,
	focus: number,
	half: number,
): number => {
	const delta = focus - current;
	if (delta > half) {
		return focus - half;
	}
	if (delta < -half) {
		return focus + half;
	}
	return current;
};

@profiler("Camera follow", "Camera")
export class Camera2DFollowSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		for (const [cameraEntity, cameraComponent, follow] of ecs.query(
			Camera2DComponent,
			Camera2DFollowComponent,
		)) {
			this.reclaimFromDeadBorrower(ecs, cameraEntity, follow);
			const camera = cameraComponent.camera;
			const points = this.resolveTargets(ecs, follow.targets);
			if (points.length === 0) {
				continue;
			}

			const multi = points.length > 1;
			const focus = this.focusPoint(points);
			if (!multi) {
				const velocity = this.averageVelocity(ecs, follow.targets);
				focus.x += clamp(
					velocity.x * follow.lookahead.seconds,
					follow.lookahead.max,
				);
				focus.y += clamp(
					velocity.y * follow.lookahead.seconds,
					follow.lookahead.max,
				);
			}

			const targetX = multi
				? focus.x
				: deadzoned(camera.position.x, focus.x, follow.deadzone.x);
			const targetY = multi
				? focus.y
				: deadzoned(camera.position.y, focus.y, follow.deadzone.y);
			const desiredZoom = multi
				? this.fitZoom(camera, points, follow.fitPadding)
				: follow.zoom;

			camera.position.x +=
				(targetX - camera.position.x) *
				factor(dtSeconds, follow.smoothing.x);
			camera.position.y +=
				(targetY - camera.position.y) *
				factor(dtSeconds, follow.smoothing.y);
			camera.zoom +=
				(desiredZoom - camera.zoom) *
				factor(
					dtSeconds,
					(follow.smoothing.x + follow.smoothing.y) / 2,
				);
			camera.clampZoom();

			if (follow.bounds) {
				camera.confineTo(follow.bounds);
			}
		}
	}

	/**
	 * Give the camera back to gameplay once the cutscene that borrowed it no
	 * longer exists: restore the borrowed follow targets and zoom, and drop any
	 * transition the vanished sequence left mid-glide. This is the only release
	 * path, so it covers a cutscene that ended, one that was skipped, and one
	 * whose entity was destroyed outright.
	 */
	private reclaimFromDeadBorrower(
		ecs: ECS,
		cameraEntity: EntityId,
		follow: Camera2DFollowComponent,
	): void {
		const borrow = ecs.getComponent(
			cameraEntity,
			CameraFollowBorrowComponent,
		);
		if (!borrow) {
			return;
		}
		const owner = borrow.owner.id;
		if (owner !== null && ecs.componentsOf(owner).length > 0) {
			return;
		}
		follow.targets = [...borrow.targets];
		follow.zoom = borrow.zoom;
		ecs.removeComponent(cameraEntity, CameraTransitionComponent);
		ecs.removeComponent(cameraEntity, CameraFollowBorrowComponent);
	}

	private resolveTargets(
		ecs: ECS,
		targets: ReadonlyArray<EntityId>,
	): Vector2[] {
		const points: Vector2[] = [];
		for (const id of targets) {
			const transform = ecs.getComponent(id, TransformComponent);
			if (transform) {
				points.push(transform.position);
			}
		}
		return points;
	}

	private focusPoint(points: ReadonlyArray<Vector2>): Vector2 {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const p of points) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x);
			maxY = Math.max(maxY, p.y);
		}
		return new Vector2((minX + maxX) / 2, (minY + maxY) / 2);
	}

	private fitZoom(
		camera: Camera2D,
		points: ReadonlyArray<Vector2>,
		padding: number,
	): number {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const p of points) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x);
			maxY = Math.max(maxY, p.y);
		}
		return camera.zoomToFit(
			new Vector2(minX, minY),
			new Vector2(maxX, maxY),
			padding,
		);
	}

	private averageVelocity(
		ecs: ECS,
		targets: ReadonlyArray<EntityId>,
	): Vector2 {
		const sum = Vector2.zero();
		let count = 0;
		for (const id of targets) {
			const rb = ecs.getComponent(id, PhysicsBodyComponent);
			if (rb?.body) {
				sum.add(rb.linearVelocity);
				count += 1;
			}
		}
		if (count > 0) {
			sum.div(count);
		}
		return sum;
	}
}
