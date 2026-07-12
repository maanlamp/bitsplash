import Angle from "../angle";
import { Duration } from "../duration";
import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";
import type Vector2 from "../vector2";

export type SightSample = {
	x: number;
	y: number;
	blocked: boolean;
};

@serializable("Perception")
export class PerceptionComponent {
	@serialize() viewDistanceTiles: number;
	@serialize() viewAngle: Angle;
	@serialize({ group: "timing" }) detectTime: Duration;
	@serialize({ group: "timing" }) forgetTime: Duration;

	@serialize() targetId: EntityId | null = null;
	@serialize() detection: number = 0;
	canSeeTarget: boolean = false;
	@serialize() lastStimulusPos: Vector2 | null = null;
	@serialize() timeSinceStimulus: number = 0;
	@serialize() timeSinceSeen: number = Infinity;
	@serialize() timeSinceDamage: number = Infinity;
	sightSamples: SightSample[] = [];

	constructor(
		viewDistanceTiles: number = 8,
		viewAngle: number = Math.PI / 5,
		detectTime: number = 0.5,
		forgetTime: number = 4,
	) {
		this.viewDistanceTiles = viewDistanceTiles;
		this.viewAngle = new Angle(viewAngle);
		this.detectTime = new Duration(detectTime);
		this.forgetTime = new Duration(forgetTime);
	}
}
