import type { Bounds } from "../camera/camera-2d";
import type { EntityId } from "../ecs";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

export type Camera2DFollowConfig = Readonly<{
	targets?: EntityId[];
	smoothing?: Readonly<{ x: number; y: number }>;
	deadzone?: Readonly<{ x: number; y: number }>;
	lookahead?: Readonly<{ seconds: number; max: number }>;
	zoom?: number;
	fitPadding?: number;
	bounds?: Bounds | null;
}>;

@serializable("Camera2DFollow", { runtime: true })
export class Camera2DFollowComponent {
	@serialize() targets: EntityId[] = [];
	@serialize() smoothing: { x: number; y: number } = {
		x: 0.12,
		y: 0.18,
	};
	@serialize() deadzone: { x: number; y: number } = { x: 0, y: 0 };
	@serialize() lookahead: { seconds: number; max: number } = {
		seconds: 0,
		max: 0,
	};
	@serialize() zoom: number = 1;
	@serialize() fitPadding: number = 64;
	@serialize() bounds: Bounds | null = null;

	constructor(config: Camera2DFollowConfig = {}) {
		this.targets = config.targets ?? [];
		this.smoothing = {
			...(config.smoothing ?? { x: 0.12, y: 0.18 }),
		};
		this.deadzone = { ...(config.deadzone ?? { x: 0, y: 0 }) };
		this.lookahead = {
			...(config.lookahead ?? { seconds: 0, max: 0 }),
		};
		this.zoom = config.zoom ?? 1;
		this.fitPadding = config.fitPadding ?? 64;
		this.bounds = config.bounds ?? null;
	}
}
