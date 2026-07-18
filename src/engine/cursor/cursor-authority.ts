/**
 * A CSS cursor keyword, or `none` to hide the OS cursor (the old `hidden`
 * semantics — used where a surface paints its own cursor, e.g. the sprite brush
 * overlay).
 */
export type CursorValue = string;

/**
 * A live request handle. `update` changes the requested cursor in place;
 * `dispose` retires the request. Disposing is idempotent.
 */
export type CursorToken = Readonly<{
	update: (cursor: CursorValue) => void;
	dispose: () => void;
}>;

type Entry = {
	cursor: CursorValue;
	priority: number;
	seq: number;
};

/**
 * The single cursor authority for one surface (a `Viewport.element`, sprite
 * canvas, texture panel, or loupe overlay). Multiple sources {@link request} a
 * cursor with a priority; the authority resolves the highest-priority live
 * request (ties broken by most-recent) and writes it as an inline
 * `style.cursor` on the target element — no shared SCSS classes, no per-surface
 * bleed (plan D1).
 *
 * A resolved `grab` is upgraded to `grabbing` while the primary pointer button
 * is down on the surface, centralising the pan press-feedback the old
 * `.grab:active` rule gave for free.
 */
export class CursorAuthority {
	private readonly entries: Entry[] = [];
	private seq = 0;
	private applied: CursorValue | null = null;
	private pressed = false;

	constructor(private readonly element: HTMLElement) {
		element.addEventListener("pointerdown", this.onPointerDown);
		window.addEventListener("pointerup", this.onPointerUp);
	}

	/**
	 * Register a cursor request. Higher `priority` wins; equal priority resolves
	 * to the most recent request. Returns a token to update or retire it.
	 */
	request(cursor: CursorValue, priority = 0): CursorToken {
		const entry: Entry = { cursor, priority, seq: this.seq++ };
		this.entries.push(entry);
		this.apply();
		return {
			update: (next) => {
				if (next !== entry.cursor) {
					entry.cursor = next;
					this.apply();
				}
			},
			dispose: () => {
				const index = this.entries.indexOf(entry);
				if (index >= 0) {
					this.entries.splice(index, 1);
					this.apply();
				}
			},
		};
	}

	dispose(): void {
		this.element.removeEventListener(
			"pointerdown",
			this.onPointerDown,
		);
		window.removeEventListener("pointerup", this.onPointerUp);
		this.element.style.cursor = "";
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (event.button === 0) {
			this.pressed = true;
			this.apply();
		}
	};

	private readonly onPointerUp = (): void => {
		if (this.pressed) {
			this.pressed = false;
			this.apply();
		}
	};

	private apply(): void {
		let best: Entry | null = null;
		for (const entry of this.entries) {
			if (
				!best ||
				entry.priority > best.priority ||
				(entry.priority === best.priority && entry.seq > best.seq)
			) {
				best = entry;
			}
		}
		let value = best ? best.cursor : "";
		if (value === "grab" && this.pressed) {
			value = "grabbing";
		}
		if (value !== this.applied) {
			this.applied = value;
			this.element.style.cursor = value;
		}
	}
}
