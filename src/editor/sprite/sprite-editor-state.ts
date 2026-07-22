import { Subscribable } from "../subscribable";
import { chromaInGamut, type OklchColor } from "../color/oklch";
import { type BrushShape, MIN_BRUSH_SIZE } from "./brush-dab";
import type { PixelBuffer } from "./pixel-buffer";
import type { SpriteToolId } from "./sprite-tool-id";
import {
	DEFAULT_MODIFIERS,
	type InkMode,
	type SpriteModifiers,
	type SymmetryMode,
} from "./sprite-modifiers";

export class SpriteEditorState extends Subscribable {
	private _l = 1;
	private _c = 0;
	private _h = 0;
	private _alpha = 1;
	private _tool: SpriteToolId = "brush";
	private _tempTools: SpriteToolId[] = [];
	private _modifiers: SpriteModifiers = DEFAULT_MODIFIERS;
	private _activeAttachment: string | null = null;
	private _brushSize = MIN_BRUSH_SIZE;
	private _brushShape: BrushShape = "round";
	private _fillContiguous = true;
	private _fillTolerance = 0;
	private _wandContiguous = true;
	private _wandTolerance = 0;
	private _shapeFill = false;
	private _pressureSize = false;
	private _pressureOpacity = false;
	private _ditherDensity = 50;
	private _scatterRadius = 4;
	private _scatterDensity = 3;
	private _scatterSizeJitter = 0.5;
	private _customBrush: PixelBuffer | null = null;

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

	/**
	 * The active tool id — the temporary hold-tool if one is active, otherwise
	 * the committed tool.
	 */
	get tool(): SpriteToolId {
		return this._tempTools.at(-1) ?? this._tool;
	}

	get modifiers(): SpriteModifiers {
		return this._modifiers;
	}

	/** Brush/eraser/shape dab diameter in pixels (`>= 1`). */
	get brushSize(): number {
		return this._brushSize;
	}

	/** Brush/eraser/shape dab silhouette. */
	get brushShape(): BrushShape {
		return this._brushShape;
	}

	/** Whether the fill tool floods contiguously (vs. every matching cell). */
	get fillContiguous(): boolean {
		return this._fillContiguous;
	}

	/** Fill colour-match tolerance, `0..255` (max-channel RGBA distance). */
	get fillTolerance(): number {
		return this._fillTolerance;
	}

	/** Whether the magic wand selects contiguously (vs. every matching cell). */
	get wandContiguous(): boolean {
		return this._wandContiguous;
	}

	/** Magic-wand colour-match tolerance, `0..255` (max-channel RGBA distance). */
	get wandTolerance(): number {
		return this._wandTolerance;
	}

	/** Whether rectangle/ellipse draw filled (vs. outline only). */
	get shapeFill(): boolean {
		return this._shapeFill;
	}

	/** Whether pen pressure scales the brush dab diameter. */
	get pressureSize(): boolean {
		return this._pressureSize;
	}

	/** Whether pen pressure scales the committed stroke opacity. */
	get pressureOpacity(): boolean {
		return this._pressureOpacity;
	}

	/** Dither-brush pattern density, `0..100` (percent of cells filled). */
	get ditherDensity(): number {
		return this._ditherDensity;
	}

	/** Scatter-brush spray radius in pixels (`>= 0`). */
	get scatterRadius(): number {
		return this._scatterRadius;
	}

	/** Scatter-brush dabs sprayed per burst (`>= 1`). */
	get scatterDensity(): number {
		return this._scatterDensity;
	}

	/** Scatter-brush per-dab size jitter, `0..1` (fraction of size it may shrink). */
	get scatterSizeJitter(): number {
		return this._scatterSizeJitter;
	}

	/**
	 * The captured custom-brush stamp, or `null` when none has been captured. The
	 * custom-brush tool stamps this buffer along a stroke; the "capture brush from
	 * selection" action sets it.
	 */
	get customBrush(): PixelBuffer | null {
		return this._customBrush;
	}

	setCustomBrush(stamp: PixelBuffer | null): void {
		this._customBrush = stamp;
		this.notify();
	}

	setBrushSize(size: number): void {
		const next = Math.max(MIN_BRUSH_SIZE, Math.floor(size));
		if (next === this._brushSize) {
			return;
		}
		this._brushSize = next;
		this.notify();
	}

	setBrushShape(shape: BrushShape): void {
		if (shape === this._brushShape) {
			return;
		}
		this._brushShape = shape;
		this.notify();
	}

	setFillContiguous(contiguous: boolean): void {
		if (contiguous === this._fillContiguous) {
			return;
		}
		this._fillContiguous = contiguous;
		this.notify();
	}

	setFillTolerance(tolerance: number): void {
		const next = Math.max(0, Math.min(255, Math.round(tolerance)));
		if (next === this._fillTolerance) {
			return;
		}
		this._fillTolerance = next;
		this.notify();
	}

	setWandContiguous(contiguous: boolean): void {
		if (contiguous === this._wandContiguous) {
			return;
		}
		this._wandContiguous = contiguous;
		this.notify();
	}

	setWandTolerance(tolerance: number): void {
		const next = Math.max(0, Math.min(255, Math.round(tolerance)));
		if (next === this._wandTolerance) {
			return;
		}
		this._wandTolerance = next;
		this.notify();
	}

	setShapeFill(fill: boolean): void {
		if (fill === this._shapeFill) {
			return;
		}
		this._shapeFill = fill;
		this.notify();
	}

	setPressureSize(on: boolean): void {
		if (on === this._pressureSize) {
			return;
		}
		this._pressureSize = on;
		this.notify();
	}

	setPressureOpacity(on: boolean): void {
		if (on === this._pressureOpacity) {
			return;
		}
		this._pressureOpacity = on;
		this.notify();
	}

	setDitherDensity(density: number): void {
		const next = Math.max(0, Math.min(100, Math.round(density)));
		if (next === this._ditherDensity) {
			return;
		}
		this._ditherDensity = next;
		this.notify();
	}

	setScatterRadius(radius: number): void {
		const next = Math.max(0, Math.round(radius));
		if (next === this._scatterRadius) {
			return;
		}
		this._scatterRadius = next;
		this.notify();
	}

	setScatterDensity(count: number): void {
		const next = Math.max(1, Math.round(count));
		if (next === this._scatterDensity) {
			return;
		}
		this._scatterDensity = next;
		this.notify();
	}

	setScatterSizeJitter(jitter: number): void {
		const next = Math.max(0, Math.min(1, jitter));
		if (next === this._scatterSizeJitter) {
			return;
		}
		this._scatterSizeJitter = next;
		this.notify();
	}

	/**
	 * The attachment-point name the attachment tool edits, or `null` when none is
	 * selected. The attachments panel owns selection; the tool reads this to know
	 * which point a canvas click places or moves.
	 */
	get activeAttachment(): string | null {
		return this._activeAttachment;
	}

	setActiveAttachment(name: string | null): void {
		if (name === this._activeAttachment) {
			return;
		}
		this._activeAttachment = name;
		this.notify();
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

	/**
	 * Set the committed tool. If a temporary hold-tool is active it stays on top
	 * (the committed tool is what is restored when the hold is released).
	 */
	setTool(tool: SpriteToolId): void {
		if (tool === this._tool) {
			return;
		}
		const before = this.tool;
		this._tool = tool;
		if (this.tool !== before) {
			this.notify();
		}
	}

	/**
	 * Push a temporary tool onto the hold stack (the hold-key experiment).
	 * Holding a tool's shortcut activates it; releasing pops it and restores the
	 * previous tool. Stacking is supported so nested holds resolve last-in-first.
	 *
	 * @example
	 * ```ts
	 * state.setTool("brush");
	 * state.pushTemporaryTool("pan"); // state.tool === "pan"
	 * state.popTemporaryTool();       // state.tool === "brush"
	 * ```
	 */
	pushTemporaryTool(tool: SpriteToolId): void {
		const before = this.tool;
		this._tempTools.push(tool);
		if (this.tool !== before) {
			this.notify();
		}
	}

	/** Pop the most recent temporary tool, restoring the tool beneath it. */
	popTemporaryTool(): void {
		if (this._tempTools.length === 0) {
			return;
		}
		const before = this.tool;
		this._tempTools.pop();
		if (this.tool !== before) {
			this.notify();
		}
	}

	/**
	 * Drop the entire temporary-tool stack, restoring the committed tool. The
	 * recovery path for a hold whose release was never observed — e.g. the
	 * window lost focus (alt-tab) between a hold-key's keydown and keyup, so the
	 * keyup went to another window. Without this the held tool (pan) would
	 * strand on top of the stack and the committed brush/eraser could never
	 * become active again.
	 */
	clearTemporaryTools(): void {
		if (this._tempTools.length === 0) {
			return;
		}
		const before = this.tool;
		this._tempTools = [];
		if (this.tool !== before) {
			this.notify();
		}
	}

	setInk(ink: InkMode): void {
		this.setModifiers({ ...this._modifiers, ink });
	}

	setSymmetry(symmetry: SymmetryMode): void {
		this.setModifiers({ ...this._modifiers, symmetry });
	}

	setPixelPerfect(pixelPerfect: boolean): void {
		this.setModifiers({ ...this._modifiers, pixelPerfect });
	}

	setStabilizer(stabilizer: number): void {
		this.setModifiers({ ...this._modifiers, stabilizer });
	}

	private setModifiers(next: SpriteModifiers): void {
		const current = this._modifiers;
		if (
			next.ink === current.ink &&
			next.symmetry === current.symmetry &&
			next.pixelPerfect === current.pixelPerfect &&
			next.stabilizer === current.stabilizer
		) {
			return;
		}
		this._modifiers = next;
		this.notify();
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
