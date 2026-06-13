import { Subscribable } from "../subscribable";
import { chromaInGamut, type OklchColor, rgbToOklch } from "./oklch";

export type SpriteTool = "paint" | "erase" | "pan" | "pick";

export class SpriteEditorState extends Subscribable {
	private _l = 1;
	private _c = 0;
	private _h = 0;
	private _alpha = 1;
	private _tool: SpriteTool = "paint";

	get l(): number {
		return this._l;
	}

	get c(): number {
		return this._c;
	}

	get h(): number {
		return this._h;
	}

	get alpha(): number {
		return this._alpha;
	}

	get color(): OklchColor {
		return { l: this._l, c: this._c, h: this._h, alpha: this._alpha };
	}

	get css(): string {
		return `oklch(${this._l} ${this._c} ${this._h} / ${this._alpha})`;
	}

	get opaqueCss(): string {
		return `oklch(${this._l} ${this._c} ${this._h})`;
	}

	get tool(): SpriteTool {
		return this._tool;
	}

	setL(l: number): void {
		this.update(l, this._c, this._h, this._alpha);
	}

	setC(c: number): void {
		this.update(this._l, c, this._h, this._alpha);
	}

	setH(h: number): void {
		this.update(this._l, this._c, h, this._alpha);
	}

	setAlpha(alpha: number): void {
		this.update(this._l, this._c, this._h, alpha);
	}

	setLc(l: number, c: number): void {
		this.update(l, c, this._h, this._alpha);
	}

	setColor(color: OklchColor): void {
		this.update(color.l, color.c, color.h, color.alpha);
	}

	setFromRgba(r: number, g: number, b: number, a: number): void {
		const { l, c, h } = rgbToOklch(r, g, b);
		this.update(l, c, h, a / 255);
	}

	setTool(tool: SpriteTool): void {
		if (tool !== this._tool) {
			this._tool = tool;
			this.notify();
		}
	}

	private update(
		l: number,
		c: number,
		h: number,
		alpha: number,
	): void {
		const clamped = chromaInGamut(l, c, h);
		if (
			l === this._l &&
			clamped === this._c &&
			h === this._h &&
			alpha === this._alpha
		) {
			return;
		}
		this._l = l;
		this._c = clamped;
		this._h = h;
		this._alpha = alpha;
		this.notify();
	}
}
