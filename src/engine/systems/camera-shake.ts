import { Camera2DComponent } from "../components/camera-2d";
import { CameraShakeComponent } from "../components/camera-shake";
import { type UpdateContext, UpdateSystem } from "../system";

export class CameraShakeSystem implements UpdateSystem {
	update({ dt, time, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		for (const [, cameraComponent, shake] of ecs.query(
			Camera2DComponent,
			CameraShakeComponent,
		)) {
			const camera = cameraComponent.camera;
			const amount = shake.maxOffset * shake.trauma * shake.trauma;
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
