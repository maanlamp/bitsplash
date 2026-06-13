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

	private target: HTMLElement;
	private wheelAccum = new Vector2(0, 0);

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

	update(): void {
		this.wheel.x = this.wheelAccum.x;
		this.wheel.y = this.wheelAccum.y;
		this.wheelAccum.x = 0;
		this.wheelAccum.y = 0;
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

	private onMouseMove = (e: MouseEvent): void => {
		const rect = this.target.getBoundingClientRect();
		this.position.x = e.clientX - rect.left;
		this.position.y = e.clientY - rect.top;
		this.inside = true;
	};

	private onMouseDown = (e: MouseEvent): void => {
		this.target.focus();
		this.buttons[buttonName(e.button)] = true;
	};

	private onMouseUp = (e: MouseEvent): void => {
		delete this.buttons[buttonName(e.button)];
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
