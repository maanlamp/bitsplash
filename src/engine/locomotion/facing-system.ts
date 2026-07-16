import { profiler } from "../profiling/profiler";
import { type UpdateContext, UpdateSystem } from "../system";
import { FacingComponent } from "./facing-component";
import { MovementIntentComponent } from "./movement-intent-component";

@profiler("Facing", "Animation")
export class FacingSystem implements UpdateSystem {
	update({ ecs }: UpdateContext): void {
		for (const [, facing, intent] of ecs.query(
			FacingComponent,
			MovementIntentComponent,
		)) {
			if (intent.faceX !== null && intent.faceX !== 0) {
				facing.dir = Math.sign(intent.faceX);
			} else if (intent.moveX !== 0) {
				facing.dir = Math.sign(intent.moveX);
			}
			intent.faceX = null;
		}
	}
}
