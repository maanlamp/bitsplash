import { type UpdateContext, UpdateSystem } from "../system";
import type { LastUsedDevice } from "./last-used-device";

export class LastUsedDeviceSystem extends UpdateSystem {
	constructor(private readonly device: LastUsedDevice) {
		super();
	}

	update(ctx: UpdateContext): void {
		this.device.update(ctx.input);
	}
}
