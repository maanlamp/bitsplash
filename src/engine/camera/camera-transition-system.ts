import { ease } from "../animation/easing";
import type { Seconds } from "../duration";
import type { ECS, EntityId } from "../ecs";
import type { EffectHandle } from "../effect-handle";
import { startFade } from "../fade/screen-fade-system";
import { type UpdateContext, UpdateSystem } from "../system";
import { TransformComponent } from "../transform-component";
import Vector2 from "../vector2";
import type { Camera2D } from "./camera-2d";
import { Camera2DComponent } from "./camera-2d-component";
import { Camera2DFollowComponent } from "./camera-2d-follow-component";
import {
	CameraTransitionComponent,
	type CameraTransitionConfig,
} from "./camera-transition-component";

const resolveTarget = (
	ecs: ECS,
	transition: CameraTransitionComponent,
): Vector2 | null => {
	if (typeof transition.target === "string") {
		const transform = ecs.getComponent(
			transition.target,
			TransformComponent,
		);
		return transform ? transform.position : null;
	}
	return transition.target;
};

const finish = (
	ecs: ECS,
	cameraEntity: EntityId,
	camera: Camera2D,
	follow: Camera2DFollowComponent,
	transition: CameraTransitionComponent,
): void => {
	const destination = resolveTarget(ecs, transition);
	if (destination) {
		camera.position.copy(destination);
	}
	camera.zoom = transition.zoom ?? follow.zoom;
	camera.clampZoom();
	follow.targets = [...transition.followAfter];
	if (transition.zoom !== null && transition.followAfter.length > 0) {
		follow.zoom = transition.zoom;
	}
	ecs.removeComponent(cameraEntity, CameraTransitionComponent);
};

export const startCameraTransition = (
	ecs: ECS,
	config: CameraTransitionConfig,
): EffectHandle => {
	const entry = ecs.query(
		Camera2DComponent,
		Camera2DFollowComponent,
	)[0];
	if (!entry) {
		return { done: () => true, complete: () => {} };
	}
	const [cameraEntity, cameraComponent, follow] = entry;
	const camera = cameraComponent.camera;

	const existing = ecs.getComponent(
		cameraEntity,
		CameraTransitionComponent,
	);
	if (existing?.mode === "cut") {
		startFade(ecs, 0, 0 as Seconds).complete();
	}
	ecs.removeComponent(cameraEntity, CameraTransitionComponent);
	const transition = new CameraTransitionComponent(config);
	transition.fromPosition = camera.position.clone();
	transition.fromZoom = camera.zoom;
	if (transition.mode === "cut") {
		transition.phase = "out";
		transition.fade = startFade(ecs, 1, transition.fadeOut);
	}
	follow.targets = [];
	ecs.addComponent(cameraEntity, transition);

	const attached = (): boolean =>
		ecs.getComponent(cameraEntity, CameraTransitionComponent) ===
		transition;
	return {
		done: () => !attached(),
		complete: () => {
			if (!attached()) {
				return;
			}
			if (transition.mode === "cut") {
				startFade(ecs, 0, 0 as Seconds).complete();
			}
			finish(ecs, cameraEntity, camera, follow, transition);
		},
	};
};

export class CameraTransitionSystem implements UpdateSystem {
	update({ time, ecs }: UpdateContext): void {
		for (const [id, cameraComponent, follow, transition] of ecs.query(
			Camera2DComponent,
			Camera2DFollowComponent,
			CameraTransitionComponent,
		)) {
			const camera = cameraComponent.camera;
			if (transition.mode === "glide") {
				this.glide(ecs, id, camera, follow, transition, time.dt);
			} else {
				this.cut(ecs, id, camera, follow, transition);
			}
		}
	}

	private glide(
		ecs: ECS,
		cameraEntity: EntityId,
		camera: Camera2D,
		follow: Camera2DFollowComponent,
		transition: CameraTransitionComponent,
		dt: Seconds,
	): void {
		transition.elapsed = (transition.elapsed + dt) as Seconds;
		const progress =
			transition.duration > 0
				? Math.min(1, transition.elapsed / transition.duration)
				: 1;
		if (progress >= 1) {
			finish(ecs, cameraEntity, camera, follow, transition);
			return;
		}
		const destination = resolveTarget(ecs, transition);
		const from = transition.fromPosition;
		if (!destination || !from) {
			finish(ecs, cameraEntity, camera, follow, transition);
			return;
		}
		const t = ease(transition.easing)(progress);
		camera.position.set(
			from.x + (destination.x - from.x) * t,
			from.y + (destination.y - from.y) * t,
		);
		const targetZoom = transition.zoom ?? follow.zoom;
		camera.zoom =
			transition.fromZoom + (targetZoom - transition.fromZoom) * t;
		camera.clampZoom();
	}

	private cut(
		ecs: ECS,
		cameraEntity: EntityId,
		camera: Camera2D,
		follow: Camera2DFollowComponent,
		transition: CameraTransitionComponent,
	): void {
		if (transition.fade && !transition.fade.done()) {
			return;
		}
		if (transition.phase === "out") {
			const destination = resolveTarget(ecs, transition);
			if (destination) {
				camera.position.copy(destination);
			}
			camera.zoom = transition.zoom ?? follow.zoom;
			camera.clampZoom();
			transition.phase = "in";
			transition.fade = startFade(ecs, 0, transition.fadeIn);
			return;
		}
		finish(ecs, cameraEntity, camera, follow, transition);
	}
}
