import { Subscribable } from "../subscribable";
import {
	type PaletteColor,
	hexToPaletteColor,
	paletteColorToHex,
} from "./palette-color";

const STORAGE_KEY = "sprite.palette";

const read = (): PaletteColor[] => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) {
			return [];
		}
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed
			.map((hex) =>
				typeof hex === "string" ? hexToPaletteColor(hex) : null,
			)
			.filter((color): color is PaletteColor => color !== null);
	} catch {
		return [];
	}
};

const write = (colors: ReadonlyArray<PaletteColor>): void => {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(colors.map(paletteColorToHex)),
		);
	} catch {}
};

/**
 * The sprite editor's working palette: an ordered, opaque-colour list held as
 * editor working state (not part of any `.bsprite` document — palette/indexed
 * colour is deferred in the format). It is a workspace-wide singleton
 * ({@link spritePalette}) so every open sprite editor shares one palette and the
 * shading ink can read it without threading it through the paint sink; the order
 * persists to `localStorage` across sessions the same way {@link
 * import("../editor-settings").EditorSettings} does.
 *
 * Reorder, add, remove and bulk replace all publish a new order and re-persist.
 */
export class SpritePalette extends Subscribable {
	private _colors: PaletteColor[] = read();

	/** The palette colours in ramp order (index `0` first). */
	get colors(): ReadonlyArray<PaletteColor> {
		return this._colors;
	}

	/** Append a colour to the end of the palette. Duplicates are allowed. */
	add(color: PaletteColor): void {
		this._colors = [...this._colors, color];
		this.commit();
	}

	/** Remove the colour at `index`; out-of-range indices are ignored. */
	removeAt(index: number): void {
		if (index < 0 || index >= this._colors.length) {
			return;
		}
		this._colors = this._colors.filter((_, i) => i !== index);
		this.commit();
	}

	/** Overwrite the colour at `index`; out-of-range indices are ignored. */
	setAt(index: number, color: PaletteColor): void {
		if (index < 0 || index >= this._colors.length) {
			return;
		}
		const next = [...this._colors];
		next[index] = color;
		this._colors = next;
		this.commit();
	}

	/**
	 * Move the colour at `from` to sit at position `to` (drag-reorder). Indices
	 * are clamped; a no-op move (same slot) publishes nothing.
	 */
	move(from: number, to: number): void {
		const length = this._colors.length;
		if (from < 0 || from >= length || from === to) {
			return;
		}
		const clampedTo = to < 0 ? 0 : to >= length ? length - 1 : to;
		if (from === clampedTo) {
			return;
		}
		const next = [...this._colors];
		const [moved] = next.splice(from, 1);
		next.splice(clampedTo, 0, moved!);
		this._colors = next;
		this.commit();
	}

	/** Replace the whole palette (a `.gpl`/`.hex`/Lospec load) in one publish. */
	replace(colors: ReadonlyArray<PaletteColor>): void {
		this._colors = [...colors];
		this.commit();
	}

	private commit(): void {
		write(this._colors);
		this.notify();
	}
}

/** The shared working palette read by the palette panel and the shading ink. */
export const spritePalette = new SpritePalette();
