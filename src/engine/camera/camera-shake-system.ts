import { Camera2DComponent } from "../camera/camera-2d-component";
import { CameraShakeComponent } from "../camera/camera-shake-component";
import { profiler } from "../profiling/profiler";
import { playerSettings } from "../settings/player-settings";
import { type UpdateContext, UpdateSystem } from "../system";

/**
 * Displaces the camera by a decaying trauma value, scaled by the player's
 * camera-shake accessibility setting — `0` holds the camera still while trauma
 * still decays, so nothing downstream waits forever on a shake that never runs.
 */
@profiler("Camera shake", "Camera")
export class CameraShakeSystem implements UpdateSystem {
	update({ dt, time, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		const scale = playerSettings.cameraShake;
		for (const [, cameraComponent, shake] of ecs.query(
			Camera2DComponent,
			CameraShakeComponent,
		)) {
			const camera = cameraComponent.camera;
			const amount =
				shake.maxOffset * shake.trauma * shake.trauma * scale;
			const t = time.elapsed * shake.frequency;
			camera.shake.set(
				Math.sin(t) * amount,
				Math.sin(t * 1.3 + 1.7) * amount,
			);
			shake.trauma = Math.max(
				0,
				shake.trauma - shake.decay * dtSeconds,
			);
		}
	}
}
