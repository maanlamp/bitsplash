import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import type { PickupType } from "../pickup/pickup-component";

export type TourTarget = Readonly<{ id: EntityId; type: PickupType }>;

export type TourPhase = "idle" | "out" | "in";

export class PickupTourComponent {
	queue: TourTarget[];
	current: TourTarget | null = null;
	phase: TourPhase = "idle";
	elapsed = 0 as Seconds;
	returning = false;
	fadeOut: Seconds;
	fadeIn: Seconds;
	focusZoom: number;

	constructor(
		queue: TourTarget[] = [],
		fadeOut = 0.35 as Seconds,
		fadeIn = 0.45 as Seconds,
		focusZoom = 6,
	) {
		this.queue = queue;
		this.fadeOut = fadeOut;
		this.fadeIn = fadeIn;
		this.focusZoom = focusZoom;
	}
}
