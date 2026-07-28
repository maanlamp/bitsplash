import type { DeviceSnapshot } from "../../input/device-snapshot";
import { token } from "../../input/edge-detector";
import type { GamepadState } from "../../input/gamepad";
import Vector2 from "../../vector2";

export const WHEEL_TOKEN = "mouse:wheel";

const ZERO_POINT = { x: 0, y: 0 } as const;

const GAMEPAD_BUTTONS: readonly string[] = [
	"south",
	"east",
	"west",
	"north",
	"l1",
	"r1",
	"l2",
	"r2",
	"select",
	"start",
	"l3",
	"r3",
	"dpadUp",
	"dpadDown",
	"dpadLeft",
	"dpadRight",
	"home",
];

const gamepadName = (index: string): string =>
	GAMEPAD_BUTTONS[Number(index)] ?? index;

const filterKeys = (
	keys: Readonly<Record<string, boolean>>,
	consumed: ReadonlySet<string>,
): Readonly<Record<string, boolean>> => {
	let changed = false;
	for (const key in keys) {
		if (keys[key] && consumed.has(`kbd:${key}`)) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		return keys;
	}
	const out: Record<string, boolean> = {};
	for (const key in keys) {
		if (keys[key] && consumed.has(`kbd:${key}`)) {
			continue;
		}
		out[key] = keys[key]!;
	}
	return out;
};

const filterMouseButtons = (
	buttons: Readonly<Record<string, boolean>>,
	consumed: ReadonlySet<string>,
): Readonly<Record<string, boolean>> => {
	let changed = false;
	for (const button in buttons) {
		if (buttons[button] && consumed.has(`mouse:${button}`)) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		return buttons;
	}
	const out: Record<string, boolean> = {};
	for (const button in buttons) {
		if (buttons[button] && consumed.has(`mouse:${button}`)) {
			continue;
		}
		out[button] = buttons[button]!;
	}
	return out;
};

const padHasConsumed = (
	pad: string,
	state: GamepadState,
	consumed: ReadonlySet<string>,
): boolean => {
	for (const index in state.buttons) {
		if (
			state.buttons[index] &&
			consumed.has(`pad${pad}:${gamepadName(index)}`)
		) {
			return true;
		}
	}
	for (const pair in state.axes) {
		if (
			consumed.has(token.stick(pad, pair, "x")) ||
			consumed.has(token.stick(pad, pair, "y"))
		) {
			return true;
		}
	}
	return false;
};

const maskAxes = (
	pad: string,
	axes: Readonly<Record<string, Vector2>>,
	consumed: ReadonlySet<string>,
): Readonly<Record<string, Vector2>> => {
	const out: Record<string, Vector2> = {};
	for (const pair in axes) {
		const stick = axes[pair]!;
		const x = consumed.has(token.stick(pad, pair, "x")) ? 0 : stick.x;
		const y = consumed.has(token.stick(pad, pair, "y")) ? 0 : stick.y;
		out[pair] =
			x === stick.x && y === stick.y ? stick : new Vector2(x, y);
	}
	return out;
};

const maskPad = (
	pad: string,
	state: GamepadState,
	consumed: ReadonlySet<string>,
): GamepadState => {
	if (!padHasConsumed(pad, state, consumed)) {
		return state;
	}
	const buttons: Record<string, boolean> = {};
	for (const index in state.buttons) {
		if (!state.buttons[index]) {
			continue;
		}
		if (consumed.has(`pad${pad}:${gamepadName(index)}`)) {
			continue;
		}
		buttons[index] = true;
	}
	return {
		buttons,
		axes: maskAxes(pad, state.axes, consumed),
		id: state.id,
		mapping: state.mapping,
	};
};

const filterGamepads = (
	pads: Readonly<Record<string, GamepadState>>,
	consumed: ReadonlySet<string>,
): Readonly<Record<string, GamepadState>> => {
	let changed = false;
	for (const pad in pads) {
		if (padHasConsumed(pad, pads[pad]!, consumed)) {
			changed = true;
			break;
		}
	}
	if (!changed) {
		return pads;
	}
	const out: Record<string, GamepadState> = {};
	for (const pad in pads) {
		out[pad] = maskPad(pad, pads[pad]!, consumed);
	}
	return out;
};

const fullMask = (source: DeviceSnapshot): DeviceSnapshot => {
	const gamepads: Record<string, GamepadState> = {};
	for (const pad in source.gamepads) {
		const state = source.gamepads[pad]!;
		gamepads[pad] = {
			buttons: {},
			axes: {},
			id: state.id,
			mapping: state.mapping,
		};
	}
	return {
		keyboard: { keys: {} },
		mouse: {
			buttons: {},
			position: source.mouse.position,
			wheel: ZERO_POINT,
			inside: source.mouse.inside,
		},
		gamepads,
	};
};

export const maskedInput = (
	source: DeviceSnapshot,
	consumed: ReadonlySet<string>,
	modal = false,
): DeviceSnapshot => {
	if (modal) {
		return fullMask(source);
	}
	if (consumed.size === 0) {
		return source;
	}
	const keys = filterKeys(source.keyboard.keys, consumed);
	const buttons = filterMouseButtons(source.mouse.buttons, consumed);
	const wheel = consumed.has(WHEEL_TOKEN)
		? ZERO_POINT
		: source.mouse.wheel;
	const gamepads = filterGamepads(source.gamepads, consumed);

	if (
		keys === source.keyboard.keys &&
		buttons === source.mouse.buttons &&
		wheel === source.mouse.wheel &&
		gamepads === source.gamepads
	) {
		return source;
	}

	return {
		keyboard: { keys },
		mouse: {
			buttons,
			position: source.mouse.position,
			wheel,
			inside: source.mouse.inside,
		},
		gamepads,
	};
};
