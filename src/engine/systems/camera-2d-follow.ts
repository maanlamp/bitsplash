import type { Camera2D } from "../camera-2d";
import { Camera2DComponent } from "../components/camera-2d";
import { Camera2DFollowComponent } from "../components/camera-2d-follow";
import { PhysicsBodyComponent } from "../components/physics-body";
import { TransformComponent } from "../components/transform";
import type { ECS, EntityId } from "../ecs";
import { type UpdateContext, UpdateSystem } from "../system";
import Vector2 from "../vector2";

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

export class Camera2DFollowSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		for (const [, cameraComponent, follow] of ecs.query(
			Camera2DComponent,
			Camera2DFollowComponent,
		)) {
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
