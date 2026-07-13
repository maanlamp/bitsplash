import type { DeviceSnapshot } from "../device-snapshot";

export type Device = "mkb" | "gamepad";

export type ActiveDeviceConfig = Readonly<{
	switchDeadzone: number;
	mouseSwitchDelta: number;
	aimStickIndex: string;
	promptStealThreshold: number;
	promptReleaseThreshold: number;
	promptSustainSeconds: number;
	aimStealThreshold: number;
	aimReleaseThreshold: number;
	aimSustainSeconds: number;
	maxDt: number;
}>;

export const DEFAULT_ACTIVE_DEVICE_CONFIG: ActiveDeviceConfig = {
	switchDeadzone: 0.35,
	mouseSwitchDelta: 8,
	aimStickIndex: "1",
	promptStealThreshold: 0.5,
	promptReleaseThreshold: 0.5,
	promptSustainSeconds: 0,
	aimStealThreshold: 0.6,
	aimReleaseThreshold: 0.25,
	aimSustainSeconds: 0.12,
	maxDt: 1 / 15,
};

const anyTrue = (
	record: Readonly<Record<string, boolean>>,
): boolean => {
	for (const key in record) {
		if (record[key]) {
			return true;
		}
	}
	return false;
};

const normalizeMagnitude = (
	magnitude: number,
	deadzone: number,
): number => {
	if (magnitude <= deadzone) {
		return 0;
	}
	const span = 1 - deadzone;
	if (span <= 0) {
		return 1;
	}
	return Math.min((magnitude - deadzone) / span, 1);
};

const other = (device: Device): Device =>
	device === "mkb" ? "gamepad" : "mkb";

export class ActiveDevice {
	private readonly config: ActiveDeviceConfig;
	private promptOwner: Device;
	private aimOwnerDevice: Device;
	private promptCharge = 0;
	private aimCharge = 0;
	private prevMouseX = 0;
	private prevMouseY = 0;
	private hasPrevMouse = false;
	private mouseAccum = 0;

	constructor(
		initial: Device = "mkb",
		config: ActiveDeviceConfig = DEFAULT_ACTIVE_DEVICE_CONFIG,
	) {
		this.config = config;
		this.promptOwner = initial;
		this.aimOwnerDevice = initial;
	}

	get promptDevice(): Device {
		return this.promptOwner;
	}

	get aimOwner(): Device {
		return this.aimOwnerDevice;
	}

	reset(): void {
		this.promptCharge = 0;
		this.aimCharge = 0;
		this.hasPrevMouse = false;
		this.mouseAccum = 0;
	}

	update(snapshot: DeviceSnapshot, dt: number): void {
		const clampedDt = Math.min(Math.max(dt, 0), this.config.maxDt);

		const position = snapshot.mouse.position;
		let movePulse = 0;
		if (this.hasPrevMouse) {
			const dx = position.x - this.prevMouseX;
			const dy = position.y - this.prevMouseY;
			this.mouseAccum += Math.sqrt(dx * dx + dy * dy);
			if (this.mouseAccum >= this.config.mouseSwitchDelta) {
				movePulse = 1;
				this.mouseAccum = 0;
			}
		}
		this.prevMouseX = position.x;
		this.prevMouseY = position.y;
		this.hasPrevMouse = true;

		const keyDown = anyTrue(snapshot.keyboard.keys) ? 1 : 0;
		const mouseButtonDown = anyTrue(snapshot.mouse.buttons) ? 1 : 0;
		const wheel = snapshot.mouse.wheel;
		const wheelActive = wheel.x !== 0 || wheel.y !== 0 ? 1 : 0;

		let gamepadButtonDown = 0;
		let anyStick = 0;
		let aimStick = 0;
		for (const pad in snapshot.gamepads) {
			const state = snapshot.gamepads[pad]!;
			if (gamepadButtonDown === 0 && anyTrue(state.buttons)) {
				gamepadButtonDown = 1;
			}
			for (const pair in state.axes) {
				const stick = state.axes[pair]!;
				const magnitude = Math.sqrt(
					stick.x * stick.x + stick.y * stick.y,
				);
				const normalized = normalizeMagnitude(
					magnitude,
					this.config.switchDeadzone,
				);
				if (normalized > anyStick) {
					anyStick = normalized;
				}
				if (
					pair === this.config.aimStickIndex &&
					normalized > aimStick
				) {
					aimStick = normalized;
				}
			}
		}

		const mkbPrompt = Math.max(
			keyDown,
			mouseButtonDown,
			wheelActive,
			movePulse,
		);
		const gamepadPrompt = Math.max(gamepadButtonDown, anyStick);
		const mkbAim = movePulse;
		const gamepadAim = aimStick;

		this.arbitratePrompt(mkbPrompt, gamepadPrompt, clampedDt);
		this.arbitrateAim(mkbAim, gamepadAim, clampedDt);
	}

	private arbitratePrompt(
		mkbActivity: number,
		gamepadActivity: number,
		dt: number,
	): void {
		const challenger = other(this.promptOwner);
		const activity =
			challenger === "mkb" ? mkbActivity : gamepadActivity;
		if (activity >= this.config.promptStealThreshold) {
			this.promptCharge += dt;
		} else if (activity < this.config.promptReleaseThreshold) {
			this.promptCharge = 0;
		}
		if (
			activity >= this.config.promptStealThreshold &&
			this.promptCharge >= this.config.promptSustainSeconds
		) {
			this.promptOwner = challenger;
			this.promptCharge = 0;
		}
	}

	private arbitrateAim(
		mkbActivity: number,
		gamepadActivity: number,
		dt: number,
	): void {
		const challenger = other(this.aimOwnerDevice);
		const activity =
			challenger === "mkb" ? mkbActivity : gamepadActivity;
		if (activity >= this.config.aimStealThreshold) {
			this.aimCharge += dt;
		} else if (activity < this.config.aimReleaseThreshold) {
			this.aimCharge = 0;
		}
		if (
			activity >= this.config.aimStealThreshold &&
			this.aimCharge >= this.config.aimSustainSeconds
		) {
			this.aimOwnerDevice = challenger;
			this.aimCharge = 0;
		}
	}
}
