import Vector2 from "../vector2";

const BUTTON_NAMES = [
	"left",
	"middle",
	"right",
	"back",
	"forward",
] as const;

const buttonName = (button: number): string =>
	BUTTON_NAMES[button] ?? String(button);

export class Mouse {
	readonly position = new Vector2(0, 0);
	readonly buttons: Record<string, boolean> = {};
	readonly wheel = new Vector2(0, 0);
	inside = false;
	/**
	 * Modifier state captured from the latest mouse event. Read this (not the
	 * keyboard) for modifier-gated drag behaviour: mouse events keep firing and
	 * carry live modifier flags while a button is held, so a focus-loss blur that
	 * clears the keyboard never wipes it mid-drag (plan E4).
	 */
	readonly modifiers: {
		ctrl: boolean;
		shift: boolean;
		alt: boolean;
		meta: boolean;
	} = { ctrl: false, shift: false, alt: false, meta: false };

	private target: HTMLElement;
	private wheelAccum = new Vector2(0, 0);
	private readonly pressedSinceUpdate = new Set<string>();
	private readonly deferredRelease = new Set<string>();
	private readonly pendingRelease = new Set<string>();

	constructor(target: HTMLElement) {
		this.target = target;
		target.addEventListener("mousemove", this.onMouseMove);
		target.addEventListener("mousedown", this.onMouseDown);
		target.addEventListener("mouseup", this.onMouseUp);
		target.addEventListener("mouseenter", this.onMouseEnter);
		target.addEventListener("mouseleave", this.onMouseLeave);
		target.addEventListener("contextmenu", this.onContextMenu);
		target.addEventListener("wheel", this.onWheel, {
			passive: false,
		});
	}

	/**
	 * Rolls the per-frame wheel delta and retires held-open buttons.
	 *
	 * Button state is polled once per frame, so a press and its release landing
	 * between two polls would otherwise be invisible: no press edge, no release
	 * edge, no click. A button released in the same frame it was pressed is
	 * therefore held down for the poll that follows the press and released by
	 * the one after it, so every physical click produces both edges however
	 * briefly it was held.
	 */
	update(): void {
		this.wheel.x = this.wheelAccum.x;
		this.wheel.y = this.wheelAccum.y;
		this.wheelAccum.x = 0;
		this.wheelAccum.y = 0;
		for (const button of this.pendingRelease) {
			delete this.buttons[button];
		}
		this.pendingRelease.clear();
		for (const button of this.deferredRelease) {
			this.pendingRelease.add(button);
		}
		this.deferredRelease.clear();
		this.pressedSinceUpdate.clear();
	}

	dispose(): void {
		this.target.removeEventListener("mousemove", this.onMouseMove);
		this.target.removeEventListener("mousedown", this.onMouseDown);
		this.target.removeEventListener("mouseup", this.onMouseUp);
		this.target.removeEventListener("mouseenter", this.onMouseEnter);
		this.target.removeEventListener("mouseleave", this.onMouseLeave);
		this.target.removeEventListener(
			"contextmenu",
			this.onContextMenu,
		);
		this.target.removeEventListener("wheel", this.onWheel);
	}

	private captureModifiers(e: MouseEvent): void {
		this.modifiers.ctrl = e.ctrlKey;
		this.modifiers.shift = e.shiftKey;
		this.modifiers.alt = e.altKey;
		this.modifiers.meta = e.metaKey;
	}

	private onMouseMove = (e: MouseEvent): void => {
		this.captureModifiers(e);
		const rect = this.target.getBoundingClientRect();
		const canvas =
			this.target instanceof HTMLCanvasElement ? this.target : null;
		const scaleX =
			canvas && rect.width > 0 ? canvas.width / rect.width : 1;
		const scaleY =
			canvas && rect.height > 0 ? canvas.height / rect.height : 1;
		this.position.x = (e.clientX - rect.left) * scaleX;
		this.position.y = (e.clientY - rect.top) * scaleY;
		this.inside = true;
	};

	private onMouseDown = (e: MouseEvent): void => {
		this.captureModifiers(e);
		this.target.focus();
		const button = buttonName(e.button);
		this.pendingRelease.delete(button);
		this.deferredRelease.delete(button);
		this.pressedSinceUpdate.add(button);
		this.buttons[button] = true;
	};

	private onMouseUp = (e: MouseEvent): void => {
		this.captureModifiers(e);
		const button = buttonName(e.button);
		if (this.pressedSinceUpdate.has(button)) {
			this.deferredRelease.add(button);
			return;
		}
		delete this.buttons[button];
	};

	private onMouseEnter = (): void => {
		this.inside = true;
	};

	private onMouseLeave = (): void => {
		this.inside = false;
	};

	private onContextMenu = (e: MouseEvent): void => {
		e.preventDefault();
	};

	private onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		this.wheelAccum.x += e.deltaX;
		this.wheelAccum.y += e.deltaY;
	};
}
