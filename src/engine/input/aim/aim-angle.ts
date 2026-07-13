import type { AimApi } from "./aim-api";
import type { AimSettingsValues } from "./aim-settings";
import { normalizeAngle, shapeAxis } from "./aim-shaping";

export const DEFAULT_MAX_AIM_DT = 1 / 15;

export class AimAngle implements AimApi {
	private angle: number;
	private readonly maxDt: number;

	constructor(initialAngle = 0, maxDt = DEFAULT_MAX_AIM_DT) {
		this.angle = normalizeAngle(initialAngle);
		this.maxDt = maxDt;
	}

	sample(): number {
		return this.angle;
	}

	seed(angle: number): void {
		this.angle = normalizeAngle(angle);
	}

	setFromPointer(
		ownerX: number,
		ownerY: number,
		cursorX: number,
		cursorY: number,
	): number {
		this.angle = Math.atan2(cursorY - ownerY, cursorX - ownerX);
		return this.angle;
	}

	integrate(
		sample: number,
		dt: number,
		settings: AimSettingsValues,
	): number {
		const clampedDt = Math.min(Math.max(dt, 0), this.maxDt);
		const shaped = shapeAxis(
			sample,
			settings.deadzone,
			settings.responseCurve,
		);
		if (shaped !== 0) {
			this.angle = normalizeAngle(
				this.angle + shaped * settings.sensitivity * clampedDt,
			);
		}
		return this.angle;
	}
}
