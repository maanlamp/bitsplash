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

	targetId: EntityId | null = null;
	detection: number = 0;
	canSeeTarget: boolean = false;
	lastStimulusPos: Vector2 | null = null;
	timeSinceStimulus: number = 0;
	timeSinceSeen: number = Infinity;
	timeSinceDamage: number = Infinity;
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
