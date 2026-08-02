import {
	type FontStyle,
	type LoadedFont,
	STYLE_REGULAR,
} from "../load";
import type { Mutable } from "../mutable";
import { shapeRun } from "./shape-cache";
import { measureText, syntheticBoldExtra } from "./text-layout";

type AtlasEntry = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
	bearingX: number;
	bearingY: number;
}>;

export type GlyphQuad = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
	u0: number;
	v0: number;
	u1: number;
	v1: number;
}>;

/** A pooled {@link GlyphQuad} the atlas refills in place. */
type MutableGlyphQuad = Mutable<GlyphQuad>;

const ATLAS_WIDTH = 512;
const PAD = 2;
const STYLES: FontStyle[] = [0, 1, 2, 3];

const key = (glyphId: number, style: FontStyle): number =>
	(glyphId << 2) | style;

export class FontAtlas {
	private gl: WebGL2RenderingContext;
	private font: LoadedFont;
	readonly texture: WebGLTexture;
	private entries = new Map<number, AtlasEntry>();
	private atlasW = ATLAS_WIDTH;
	private atlasH = 1;
	/** Grown to the longest run drawn so far, then reused every layout. */
	private quadPool: MutableGlyphQuad[] = [];

	constructor(gl: WebGL2RenderingContext, font: LoadedFont) {
		this.gl = gl;
		this.font = font;
		this.texture = gl.createTexture()!;
		this.build();
	}

	private build(): void {
		const gl = this.gl;
		let x = PAD;
		let y = PAD;
		let rowH = 0;

		for (const style of STYLES) {
			for (const [glyphId, variant] of this.font.faces[style]
				.glyphCache) {
				const { width, rows } = variant;
				if (x + width + PAD > this.atlasW) {
					x = PAD;
					y += rowH + PAD;
					rowH = 0;
				}
				this.entries.set(key(glyphId, style), {
					x,
					y,
					width,
					height: rows,
					bearingX: variant.bearingX,
					bearingY: variant.bearingY,
				});
				x += width + PAD;
				rowH = Math.max(rowH, rows);
			}
		}

		this.atlasH = y + rowH + PAD;
		const data = new Uint8Array(this.atlasW * this.atlasH);

		for (const style of STYLES) {
			for (const [glyphId, variant] of this.font.faces[style]
				.glyphCache) {
				const atlasEntry = this.entries.get(key(glyphId, style))!;
				const { mask, width, rows } = variant;
				for (let row = 0; row < rows; row++) {
					for (let col = 0; col < width; col++) {
						data[
							(atlasEntry.y + row) * this.atlasW +
								(atlasEntry.x + col)
						] = mask[row * width + col]!;
					}
				}
			}
		}

		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.R8,
			this.atlasW,
			this.atlasH,
			0,
			gl.RED,
			gl.UNSIGNED_BYTE,
			data,
		);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MIN_FILTER,
			gl.NEAREST,
		);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_MAG_FILTER,
			gl.NEAREST,
		);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_WRAP_S,
			gl.CLAMP_TO_EDGE,
		);
		gl.texParameteri(
			gl.TEXTURE_2D,
			gl.TEXTURE_WRAP_T,
			gl.CLAMP_TO_EDGE,
		);
	}

	/** Fill `out` with the placement of `entry` drawn at `x`, `y`. */
	private writeQuad(
		out: MutableGlyphQuad,
		entry: AtlasEntry,
		x: number,
		y: number,
	): void {
		out.x = Math.round(x + entry.bearingX);
		out.y = Math.round(y - entry.bearingY);
		out.w = entry.width;
		out.h = entry.height;
		out.u0 = entry.x / this.atlasW;
		out.v0 = entry.y / this.atlasH;
		out.u1 = (entry.x + entry.width) / this.atlasW;
		out.v1 = (entry.y + entry.height) / this.atlasH;
	}

	/**
	 * One glyph placed at `x`, `y`, or `undefined` when the font has no such
	 * glyph. Shares the pooled buffer with {@link layout}, so the result is
	 * valid only until the next call to either.
	 */
	quadAt(
		glyphId: number,
		style: FontStyle,
		x: number,
		y: number,
	): GlyphQuad | undefined {
		const entry = this.entries.get(key(glyphId, style));
		if (!entry) {
			return undefined;
		}
		const quad = this.quadAtIndex(0);
		this.writeQuad(quad, entry, x, y);
		return quad;
	}

	/**
	 * Quads produced by the last {@link layout} call, valid up to the count it
	 * returned and only until the next call. The array is pooled and reused, so
	 * reading past the returned count, or holding entries across another layout,
	 * reads stale glyphs.
	 */
	get laidOut(): ReadonlyArray<GlyphQuad> {
		return this.quadPool;
	}

	/**
	 * Place `text` at `x`, `y` into the pooled quad buffer and return how many
	 * quads it wrote; read them from {@link laidOut}.
	 *
	 * Shaping goes through {@link shapeRun}, so a string already drawn this
	 * session is positioned from cached advances rather than reshaped.
	 *
	 * @example
	 * const count = atlas.layout(label, x, y, "left", style);
	 * for (let i = 0; i < count; i++) draw(atlas.laidOut[i]!);
	 */
	layout(
		text: string,
		x: number,
		y: number,
		align: CanvasTextAlign,
		style: FontStyle = STYLE_REGULAR,
	): number {
		const face = this.font.faces[style];
		const run = shapeRun(this.font, style, text);
		const scale = face.scale;
		const boldExtra = syntheticBoldExtra(face);
		const count = run.ids.length;

		let cursorX = x;
		if (align === "center" || align === "right") {
			// Same width the measure path reports, by construction: the sum of
			// the per-glyph advances stepped below.
			const scaled = measureText(this.font, text, style);
			cursorX = align === "center" ? x - scaled / 2 : x - scaled;
		}

		let written = 0;
		for (let i = 0; i < count; i++) {
			const entry = this.entries.get(key(run.ids[i]!, style));
			if (entry) {
				this.writeQuad(this.quadAtIndex(written), entry, cursorX, y);
				written++;
			}
			cursorX += run.advances[i]! * scale + boldExtra;
		}
		return written;
	}

	/** The pooled quad at `index`, growing the pool by one when it is short. */
	private quadAtIndex(index: number): MutableGlyphQuad {
		let quad = this.quadPool[index];
		if (!quad) {
			quad = { x: 0, y: 0, w: 0, h: 0, u0: 0, v0: 0, u1: 0, v1: 0 };
			this.quadPool[index] = quad;
		}
		return quad;
	}

	dispose(): void {
		this.gl.deleteTexture(this.texture);
	}
}
