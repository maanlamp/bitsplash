import {
	UnicodeBuffer,
	glyphBufferToShapedGlyphs,
	shape,
} from "text-shaper";
import {
	type FontStyle,
	type LoadedFont,
	STYLE_REGULAR,
} from "./load";

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

	private quadFromEntry(
		entry: AtlasEntry,
		x: number,
		y: number,
	): GlyphQuad {
		const drawX = Math.round(x + entry.bearingX);
		const drawY = Math.round(y - entry.bearingY);
		return {
			x: drawX,
			y: drawY,
			w: entry.width,
			h: entry.height,
			u0: entry.x / this.atlasW,
			v0: entry.y / this.atlasH,
			u1: (entry.x + entry.width) / this.atlasW,
			v1: (entry.y + entry.height) / this.atlasH,
		};
	}

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
		return this.quadFromEntry(entry, x, y);
	}

	layout(
		text: string,
		x: number,
		y: number,
		align: CanvasTextAlign,
		style: FontStyle = STYLE_REGULAR,
	): GlyphQuad[] {
		const face = this.font.faces[style];
		const unicodeBuffer = new UnicodeBuffer();
		unicodeBuffer.addStr(text);
		const shapedGlyphs = glyphBufferToShapedGlyphs(
			shape(face.shape, unicodeBuffer),
		);
		const scale = face.scale;
		const boldExtra = face.synthetic?.bold ? 1 : 0;

		let cursorX = x;
		if (align === "center" || align === "right") {
			let total = 0;
			for (const g of shapedGlyphs) {
				total += g.xAdvance;
			}
			const scaled = total * scale + boldExtra * shapedGlyphs.length;
			cursorX = align === "center" ? x - scaled / 2 : x - scaled;
		}

		const quads: GlyphQuad[] = [];
		for (const g of shapedGlyphs) {
			const entry = this.entries.get(key(g.glyphId, style));
			if (!entry) {
				cursorX += g.xAdvance * scale + boldExtra;
				continue;
			}
			quads.push(this.quadFromEntry(entry, cursorX, y));
			cursorX += g.xAdvance * scale + boldExtra;
		}
		return quads;
	}

	dispose(): void {
		this.gl.deleteTexture(this.texture);
	}
}
