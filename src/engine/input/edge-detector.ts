import type { DeviceSnapshot } from "./device-snapshot";

export const token = {
	keyboard(key: string): string {
		return `kbd:${key}`;
	},
	mouse(button: string): string {
		return `mouse:${button}`;
	},
	gamepad(pad: string | number, button: string): string {
		return `pad${pad}:${button}`;
	},
	/**
	 * Token for one axis of one analogue stick, e.g. `"pad0:stick0x"` for the
	 * horizontal axis of pad 0's left stick. Sticks carry no press/release
	 * edges, so these tokens exist purely so a consumer can mask an axis it has
	 * already spent (see `maskedInput`).
	 */
	stick(pad: string | number, pair: string, axis: "x" | "y"): string {
		return `pad${pad}:stick${pair}${axis}`;
	},
};

export type ParsedToken = Readonly<{
	device: "kbd" | "mouse" | "pad";
	pad: string | null;
	code: string;
}>;

export const parseToken = (value: string): ParsedToken | null => {
	const colon = value.indexOf(":");
	if (colon < 0) {
		return null;
	}
	const head = value.slice(0, colon);
	const code = value.slice(colon + 1);
	if (head === "kbd") {
		return { device: "kbd", pad: null, code };
	}
	if (head === "mouse") {
		return { device: "mouse", pad: null, code };
	}
	if (head.startsWith("pad")) {
		return { device: "pad", pad: head.slice(3), code };
	}
	return null;
};

export const GAMEPAD_BUTTONS: readonly string[] = [
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

const gamepadButton = (index: string): string =>
	GAMEPAD_BUTTONS[Number(index)] ?? index;

const collectDown = (
	snapshot: DeviceSnapshot,
	out: Set<string>,
): void => {
	out.clear();
	for (const key in snapshot.keyboard.keys) {
		if (snapshot.keyboard.keys[key]) {
			out.add(token.keyboard(key));
		}
	}
	for (const button in snapshot.mouse.buttons) {
		if (snapshot.mouse.buttons[button]) {
			out.add(token.mouse(button));
		}
	}
	for (const pad in snapshot.gamepads) {
		const buttons = snapshot.gamepads[pad]!.buttons;
		for (const index in buttons) {
			if (buttons[index]) {
				out.add(token.gamepad(pad, gamepadButton(index)));
			}
		}
	}
};

export class EdgeDetector {
	private prev = new Set<string>();
	private curr = new Set<string>();
	private dropEdges = false;

	step(snapshot: DeviceSnapshot): void {
		const recycled = this.prev;
		this.prev = this.curr;
		this.curr = recycled;
		collectDown(snapshot, this.curr);
		if (this.dropEdges) {
			this.prev.clear();
			for (const t of this.curr) {
				this.prev.add(t);
			}
			this.dropEdges = false;
		}
	}

	justPressed(t: string): boolean {
		return this.curr.has(t) && !this.prev.has(t);
	}

	justReleased(t: string): boolean {
		return !this.curr.has(t) && this.prev.has(t);
	}

	isDown(t: string): boolean {
		return this.curr.has(t);
	}

	reset(): void {
		this.prev.clear();
		this.curr.clear();
		this.dropEdges = true;
	}
}
