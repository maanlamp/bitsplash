import type { DeviceSnapshot } from "../../input/device-snapshot";
import { EdgeDetector, token } from "../../input/edge-detector";
import type {
	PointerButton,
	UiEvent,
	UiEventEntry,
} from "./ui-event";
import type { FocusDirection } from "./ui-event";
import type { UiEventQueue } from "./ui-event-queue";

const INITIAL_DELAY = 0.25;
const REPEAT_INTERVAL = 0.08;
const STICK_THRESHOLD = 0.5;
const FOCUS_STICK_PAIR = "0";

const CONFIRM_KEYS: readonly string[] = ["ENTER", "SPACE"];
const CANCEL_KEYS: readonly string[] = ["ESCAPE"];
const CONFIRM_PAD = "south";
const CANCEL_PAD = "east";

const DIRECTIONS: readonly FocusDirection[] = [
	"up",
	"down",
	"left",
	"right",
];

const DIRECTION_KEYS: Record<FocusDirection, string> = {
	up: "ARROWUP",
	down: "ARROWDOWN",
	left: "ARROWLEFT",
	right: "ARROWRIGHT",
};

/**
 * Keys that move focus **only while a focus trap is up**, on top of
 * {@link DIRECTION_KEYS}.
 *
 * `W`/`S` are `moveUp`/`moveDown` in gameplay, so they may not be direction keys
 * globally: an unconditional entry here would strip them from the action layer
 * every frame the player walks. Scoped to a trap, the conversation panel gets
 * `W`/`S` read-back while gameplay keeps them everywhere else.
 */
const TRAPPED_DIRECTION_KEYS: Partial<
	Record<FocusDirection, string>
> = {
	up: "W",
	down: "S",
};

const DIRECTION_PAD: Record<FocusDirection, string> = {
	up: "dpadUp",
	down: "dpadDown",
	left: "dpadLeft",
	right: "dpadRight",
};

const MOUSE_BUTTONS: readonly PointerButton[] = [
	"left",
	"middle",
	"right",
	"back",
	"forward",
];

type RepeatState = {
	active: boolean;
	repeating: boolean;
	accumulated: number;
};

const newRepeatState = (): RepeatState => ({
	active: false,
	repeating: false,
	accumulated: 0,
});

export class InputNormalizer {
	private readonly edges = new EdgeDetector();
	private readonly tokens = new Map<UiEventEntry, string[]>();
	private readonly repeat: Record<FocusDirection, RepeatState> = {
		up: newRepeatState(),
		down: newRepeatState(),
		left: newRepeatState(),
		right: newRepeatState(),
	};

	private lastX = 0;
	private lastY = 0;
	private hasLast = false;

	tokensFor(entry: UiEventEntry): readonly string[] {
		return this.tokens.get(entry) ?? [];
	}

	/**
	 * Turn one device snapshot into UI events.
	 *
	 * `trapped` says whether a focus trap currently owns navigation; it widens the
	 * direction keys by {@link TRAPPED_DIRECTION_KEYS} so a trapped panel can be
	 * walked with `W`/`S` without those keys leaving the action layer at all other
	 * times.
	 */
	sample(
		input: DeviceSnapshot,
		queue: UiEventQueue,
		uiScale: number,
		dt: number,
		trapped = false,
	): void {
		this.tokens.clear();
		this.edges.step(input);

		const scale = uiScale > 0 ? uiScale : 1;
		const x = input.mouse.position.x / scale;
		const y = input.mouse.position.y / scale;

		if (!this.hasLast || x !== this.lastX || y !== this.lastY) {
			this.emit(
				queue,
				{
					type: "pointermove",
					position: { x, y },
					button: null,
				},
				null,
			);
			this.lastX = x;
			this.lastY = y;
			this.hasLast = true;
		}

		if (input.mouse.wheel.x !== 0 || input.mouse.wheel.y !== 0) {
			this.emit(
				queue,
				{
					type: "wheel",
					position: { x, y },
					deltaX: input.mouse.wheel.x,
					deltaY: input.mouse.wheel.y,
				},
				null,
			);
		}

		for (const button of MOUSE_BUTTONS) {
			const tk = token.mouse(button);
			if (this.edges.justPressed(tk)) {
				this.emit(
					queue,
					{ type: "pointerdown", position: { x, y }, button },
					[tk],
				);
			}
			if (this.edges.justReleased(tk)) {
				this.emit(
					queue,
					{ type: "pointerup", position: { x, y }, button },
					[tk],
				);
				this.emit(
					queue,
					{ type: "click", position: { x, y }, button },
					[tk],
				);
			}
		}

		const confirmTokens = this.edgeTokens(
			input,
			CONFIRM_KEYS,
			CONFIRM_PAD,
		);
		if (confirmTokens.length) {
			this.emit(queue, { type: "confirm" }, confirmTokens);
		}

		const cancelTokens = this.edgeTokens(
			input,
			CANCEL_KEYS,
			CANCEL_PAD,
		);
		if (cancelTokens.length) {
			this.emit(queue, { type: "cancel" }, cancelTokens);
		}

		this.sampleDirections(input, queue, dt, trapped);
	}

	private sampleDirections(
		input: DeviceSnapshot,
		queue: UiEventQueue,
		dt: number,
		trapped: boolean,
	): void {
		const held: Record<FocusDirection, boolean> = {
			up: false,
			down: false,
			left: false,
			right: false,
		};
		const sources: Record<FocusDirection, string[]> = {
			up: [],
			down: [],
			left: [],
			right: [],
		};

		for (const direction of DIRECTIONS) {
			const keys = [DIRECTION_KEYS[direction]];
			const trappedKey = trapped
				? TRAPPED_DIRECTION_KEYS[direction]
				: undefined;
			if (trappedKey !== undefined) {
				keys.push(trappedKey);
			}
			for (const key of keys) {
				const keyToken = token.keyboard(key);
				if (this.edges.isDown(keyToken)) {
					held[direction] = true;
					sources[direction].push(keyToken);
				}
			}
			for (const pad in input.gamepads) {
				const padToken = token.gamepad(pad, DIRECTION_PAD[direction]);
				if (this.edges.isDown(padToken)) {
					held[direction] = true;
					sources[direction].push(padToken);
				}
			}
		}

		for (const pad in input.gamepads) {
			const stick = input.gamepads[pad]!.axes[FOCUS_STICK_PAIR];
			if (!stick) {
				continue;
			}
			const horizontal = token.stick(pad, FOCUS_STICK_PAIR, "x");
			const vertical = token.stick(pad, FOCUS_STICK_PAIR, "y");
			if (stick.x < -STICK_THRESHOLD) {
				held.left = true;
				sources.left.push(horizontal);
			} else if (stick.x > STICK_THRESHOLD) {
				held.right = true;
				sources.right.push(horizontal);
			}
			if (stick.y < -STICK_THRESHOLD) {
				held.up = true;
				sources.up.push(vertical);
			} else if (stick.y > STICK_THRESHOLD) {
				held.down = true;
				sources.down.push(vertical);
			}
		}

		if (held.left && held.right) {
			held.left = false;
			held.right = false;
		}
		if (held.up && held.down) {
			held.up = false;
			held.down = false;
		}

		for (const direction of DIRECTIONS) {
			if (
				this.stepRepeat(this.repeat[direction], held[direction], dt)
			) {
				this.emit(
					queue,
					{ type: "focusmove", direction },
					sources[direction],
				);
			}
		}
	}

	private stepRepeat(
		state: RepeatState,
		down: boolean,
		dt: number,
	): boolean {
		if (!down) {
			state.active = false;
			state.repeating = false;
			state.accumulated = 0;
			return false;
		}
		if (!state.active) {
			state.active = true;
			state.repeating = false;
			state.accumulated = 0;
			return true;
		}
		state.accumulated += dt;
		if (!state.repeating) {
			if (state.accumulated >= INITIAL_DELAY) {
				state.accumulated -= INITIAL_DELAY;
				state.repeating = true;
				return true;
			}
			return false;
		}
		if (state.accumulated >= REPEAT_INTERVAL) {
			state.accumulated -= REPEAT_INTERVAL;
			return true;
		}
		return false;
	}

	private edgeTokens(
		input: DeviceSnapshot,
		keys: readonly string[],
		padButton: string,
	): string[] {
		const out: string[] = [];
		for (const key of keys) {
			const tk = token.keyboard(key);
			if (this.edges.justPressed(tk)) {
				out.push(tk);
			}
		}
		for (const pad in input.gamepads) {
			const tk = token.gamepad(pad, padButton);
			if (this.edges.justPressed(tk)) {
				out.push(tk);
			}
		}
		return out;
	}

	private emit(
		queue: UiEventQueue,
		event: UiEvent,
		sources: readonly string[] | null,
	): void {
		const entry = queue.push(event);
		if (sources && sources.length) {
			this.tokens.set(entry, [...sources]);
		}
	}
}
