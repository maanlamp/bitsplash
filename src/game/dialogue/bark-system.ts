import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { profiler } from "../../engine/profiling/profiler";
import { BarkComponent } from "./bark-component";

@profiler("Barks", "Dialogue")
export class BarkSystem implements UpdateSystem {
	update({ dt, ecs }: UpdateContext): void {
		const dtSeconds = dt / 1000;
		for (const [id, bark] of ecs.query(BarkComponent)) {
			bark.elapsed.seconds += dtSeconds;
			if (bark.elapsed.seconds >= bark.ttl.seconds) {
				ecs.removeComponent(id, BarkComponent);
			}
		}
	}
}
