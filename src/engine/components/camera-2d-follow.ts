import type { Bounds } from "../camera-2d";
import type { EntityId } from "../ecs";

export type Camera2DFollowConfig = Readonly<{
	targets?: EntityId[];
	smoothing?: Readonly<{ x: number; y: number }>;
	deadzone?: Readonly<{ x: number; y: number }>;
	lookahead?: Readonly<{ seconds: number; max: number }>;
	zoom?: number;
	fitPadding?: number;
	bounds?: Bounds | null;
}>;

export class Camera2DFollowComponent {
	targets: EntityId[];
	smoothing: { x: number; y: number };
	deadzone: { x: number; y: number };
	lookahead: { seconds: number; max: number };
	zoom: number;
	fitPadding: number;
	bounds: Bounds | null;

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
