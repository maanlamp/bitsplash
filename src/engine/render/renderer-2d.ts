import type Viewport from "../camera/viewport";
import {
	type FontStyle,
	fontStyleOf,
	type LoadedFont,
} from "../load";
import type { Mutable } from "../mutable";
import { applyQuadBlend, type QuadBlend } from "../render/blend";
import {
	type ColorInput,
	ColorResolver,
	type MutableRGBA,
	type RGBA,
} from "../render/color-resolver";
import {
	nineSliceCells,
	type NineSliceInsets,
} from "../render/nine-slice";
import {
	type BlitProgram,
	type ConicOutlineProgram,
	createBlitProgram,
	createQuadConicOutlineProgram,
	createQuadOutlineProgram,
	createQuadProgram,
	createQuadSwayProgram,
	createTextProgram,
	createTileProgram,
	type OutlineProgram,
	type SwayProgram,
	type WorldProgram,
} from "../render/programs";
import { RenderTarget } from "../render/render-target";
import { FontAtlas, type GlyphQuad } from "../text/font-atlas";
import {
	registerRenderer,
	unregisterRenderer,
} from "./renderer-registry";

const QUAD_FLOATS = 8;
const TILE_FLOATS = 9;
const VERTS_PER_QUAD = 6;
const WHITE: RGBA = [1, 1, 1, 1];
const SOLID_UV: ReadonlyArray<number> = [0, 0, 0, 0, 0, 0, 0, 0];
const FULL_UV: ReadonlyArray<number> = [0, 0, 1, 0, 1, 1, 0, 1];

export type DrawImageOpts = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
	rotation?: number;
	flipX?: boolean;
	srcX?: number;
	srcY?: number;
	srcW?: number;
	srcH?: number;
	tint?: ColorInput;
	alpha?: number;
	/**
	 * World-unit horizontal displacement of the **top two corners only**, so
	 * the quad leans while staying pinned along its bottom edge. Applied after
	 * `rotation`, in world space. Because the displaced edges stay parallel the
	 * deformation is affine, so texels shear cleanly with no seam across the
	 * quad's diagonal. Defaults to 0.
	 *
	 * A shear is linear in height by construction. For a lean that grows toward
	 * one edge, see {@link Renderer2D.drawSwayImage}.
	 */
	shear?: number;
	blend?: QuadBlend;
}>;

/**
 * A non-linear horizontal bend applied to a sprite, evaluated per output texel
 * rather than per corner.
 *
 * `h` runs `0` at the pinned edge to `1` at the free edge. Displacement at `h`
 * is `h ** curve * lean + h ** (curve * 3) * rustle * sin(2π * (rustleFrequency * (time + phase) + h))`,
 * so `curve` decides how much of the bend is concentrated near the crown while
 * the flutter rides a far tighter power of the same height gradient — a trunk
 * that bends under leaves that rustle, which is how foliage wind is modelled.
 * A trunk's `h ** (curve * 3)` is small enough to quantize to zero, so the
 * flutter is confined to the crown without an authored mask.
 *
 * The result is snapped to a whole **source texel** before it is sampled, so
 * one unit of displacement is one art pixel at any upscale factor. The bend
 * therefore steps rather than glides; that is the pixel-art look, not an
 * artifact to smooth away.
 *
 * `lean` and `rustle` are signed world-unit travel of the **free edge**;
 * everything below it moves less. Both zero means no bend, and the caller
 * should draw a plain image instead.
 */
export type SwayParams = Readonly<{
	/** Free-edge travel in world units, signed: positive leans right. */
	lean: number;
	/** Free-edge travel of the high-frequency term, in world units. */
	rustle: number;
	/** Height power curve exponent. `1` is a plain shear; `> 1` favours the crown. */
	curve: number;
	/** Rustle oscillations per second. */
	rustleFrequency: number;
	/** Per-instance offset added to `time`, in seconds. */
	phase: number;
	/** Seconds on the caller's clock; the rustle's only time input. */
	time: number;
	/** `true` pins the bottom edge (trees), `false` the top (vines). */
	pinnedBase: boolean;
}>;

/** {@link DrawImageOpts} minus `shear`, which {@link SwayParams} supersedes. */
export type DrawSwayImageOpts = Omit<DrawImageOpts, "shear"> &
	Readonly<{ sway: SwayParams }>;

export type DrawTileOpts = Readonly<{
	tileset: HTMLImageElement;
	columns: number;
	srcSize: number;
	slot: number;
	x: number;
	y: number;
	size: number;
	quarterTurns?: number;
	flipX?: boolean;
	tint?: ColorInput;
	alpha?: number;
	blend?: QuadBlend;
}>;

export type DrawRectOpts = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
	rotation?: number;
	fill?: ColorInput;
	stroke?: ColorInput;
	lineWidth?: number;
	alpha?: number;
	blend?: QuadBlend;
}>;

/**
 * An arbitrary four-cornered quad, for geometry no axis-aligned draw can
 * express: velocity-stretched particle stripes, beams, oriented decals.
 *
 * Corners are ordered **TL, TR, BR, BL**, and world y points **down** — so
 * `px[0]`/`py[0]` and `px[1]`/`py[1]` are the top corners. `uv` pairs up with
 * them in the same order (`[u0,v0, u1,v0, u1,v1, u0,v1]` reproduces a plain
 * upright image).
 *
 * Only affine shapes map texels cleanly: translating one edge (a shear) keeps
 * the two triangles' UV interpolation consistent, but *scaling* one edge into a
 * trapezoid does not, and shows a visible seam along the quad's diagonal.
 * Stretch particles along their velocity, don't taper them.
 *
 * Omitting `image` draws a flat `tint` — no texture needed. Every such quad
 * shares one batch key, so thousands of contiguous solid particles collapse
 * into a single draw call.
 */
export type DrawCornerQuadOpts = Readonly<{
	/** X of each corner, in TL, TR, BR, BL order. Length 4. */
	px: ReadonlyArray<number>;
	/** Y of each corner, in TL, TR, BR, BL order. Length 4. */
	py: ReadonlyArray<number>;
	/** Source image; omit to draw a solid `tint`-colored quad. */
	image?: TileSource;
	/**
	 * Normalized `[u,v]` per corner, in corner order. Length 8. Defaults to the
	 * whole image; ignored when `image` is omitted.
	 */
	uv?: ReadonlyArray<number>;
	tint?: ColorInput;
	alpha?: number;
	blend?: QuadBlend;
}>;

export type DrawHoldRingOpts = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
	frame: TileSource;
	insets: NineSliceInsets;
	progress: number;
	inner: ColorInput;
	fill: ColorInput;
	outer: ColorInput;
}>;

export type DrawTextOpts = Readonly<{
	color?: ColorInput;
	align?: CanvasTextAlign;
	outline?: ColorInput;
	bold?: boolean;
	italic?: boolean;
	scale?: number;
	rotation?: number;
	alpha?: number;
	blend?: QuadBlend;
}>;

export type ClipRect = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type RawLayerContext = Readonly<{
	texW: number;
	texH: number;
	spanX: number;
	spanY: number;
	originX: number;
	originY: number;
}>;

type MutableRawLayerContext = Mutable<RawLayerContext>;

export type RawLayerFn = (
	gl: WebGL2RenderingContext,
	ctx: RawLayerContext,
) => void;

export type TileArray = Readonly<{
	texture: WebGLTexture;
	columns: number;
	rows: number;
}>;

export type TileSource =
	| HTMLImageElement
	| HTMLCanvasElement
	| OffscreenCanvas;

const sourceWidth = (source: TileSource): number =>
	"naturalWidth" in source ? source.naturalWidth : source.width;

const sourceHeight = (source: TileSource): number =>
	"naturalHeight" in source ? source.naturalHeight : source.height;

export type PresentDest = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
	[-1, -1],
	[0, -1],
	[1, -1],
	[-1, 0],
	[1, 0],
	[-1, 1],
	[0, 1],
	[1, 1],
];

/**
 * Corner order that turns a quad's four corners into two triangles. Module-level
 * so the per-quad writers index a shared array instead of building one per call.
 */
const QUAD_CORNERS: ReadonlyArray<number> = [0, 1, 2, 0, 2, 3];

const writeQuadVert = (
	out: Float32Array,
	o: number,
	x: number,
	y: number,
	u: number,
	v: number,
	c: RGBA,
): void => {
	out[o] = x;
	out[o + 1] = y;
	out[o + 2] = u;
	out[o + 3] = v;
	out[o + 4] = c[0];
	out[o + 5] = c[1];
	out[o + 6] = c[2];
	out[o + 7] = c[3];
};

const writeQuad = (
	out: Float32Array,
	o: number,
	px: ReadonlyArray<number>,
	py: ReadonlyArray<number>,
	uv: ReadonlyArray<number>,
	c: RGBA,
): void => {
	let p = o;
	for (let k = 0; k < QUAD_CORNERS.length; k++) {
		const i = QUAD_CORNERS[k]!;
		writeQuadVert(
			out,
			p,
			px[i]!,
			py[i]!,
			uv[i * 2]!,
			uv[i * 2 + 1]!,
			c,
		);
		p += QUAD_FLOATS;
	}
};

const writeTileVert = (
	out: Float32Array,
	o: number,
	x: number,
	y: number,
	u: number,
	v: number,
	layer: number,
	c: RGBA,
): void => {
	out[o] = x;
	out[o + 1] = y;
	out[o + 2] = u;
	out[o + 3] = v;
	out[o + 4] = layer;
	out[o + 5] = c[0];
	out[o + 6] = c[1];
	out[o + 7] = c[2];
	out[o + 8] = c[3];
};

const BASE_UV = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
];

export const tileUV = (
	quarterTurns: number,
	flip: boolean,
): number[] => {
	const q = ((quarterTurns % 4) + 4) % 4;
	const uv: number[] = [];
	for (let i = 0; i < 4; i++) {
		const src = BASE_UV[(i - q + 4) % 4]!;
		uv.push(flip ? 1 - src[0]! : src[0]!, src[1]!);
	}
	return uv;
};

const writeTileQuad = (
	out: Float32Array,
	o: number,
	px: ReadonlyArray<number>,
	py: ReadonlyArray<number>,
	uv: ReadonlyArray<number>,
	slot: number,
	c: RGBA,
): void => {
	let p = o;
	for (let k = 0; k < QUAD_CORNERS.length; k++) {
		const i = QUAD_CORNERS[k]!;
		writeTileVert(
			out,
			p,
			px[i]!,
			py[i]!,
			uv[i * 2]!,
			uv[i * 2 + 1]!,
			slot,
			c,
		);
		p += TILE_FLOATS;
	}
};

/**
 * Rotate four local corners about `cx`, `cy` into caller-owned `outPx`/`outPy`.
 *
 * Out-parameters rather than a returned pair: this runs once per sprite and once
 * per glyph, so returning fresh arrays put three allocations on the hottest draw
 * path in the engine.
 */
const rotateCornersInto = (
	cx: number,
	cy: number,
	lx: ReadonlyArray<number>,
	ly: ReadonlyArray<number>,
	rotation: number,
	outPx: number[],
	outPy: number[],
): void => {
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	for (let i = 0; i < 4; i++) {
		outPx[i] = cx + lx[i]! * cos - ly[i]! * sin;
		outPy[i] = cy + lx[i]! * sin + ly[i]! * cos;
	}
};

const intersectScissor = (
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } => {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.w, b.x + b.w);
	const top = Math.min(a.y + a.h, b.y + b.h);
	return { x, y, w: Math.max(0, right - x), h: Math.max(0, top - y) };
};

const writeTile = (
	out: Float32Array,
	o: number,
	x: number,
	y: number,
	size: number,
	slot: number,
	quarterTurns: number,
	flip: boolean,
	c: RGBA,
): void => {
	writeTileQuad(
		out,
		o,
		[x, x + size, x + size, x],
		[y, y, y + size, y + size],
		tileUV(quarterTurns, flip),
		slot,
		c,
	);
};

export class StaticBatch {
	private data = new Float32Array(TILE_FLOATS * VERTS_PER_QUAD * 64);
	private floats = 0;
	vertCount = 0;
	readonly vbo: WebGLBuffer;
	readonly vao: WebGLVertexArrayObject;

	constructor(
		private gl: WebGL2RenderingContext,
		setupVao: (vbo: WebGLBuffer) => WebGLVertexArrayObject,
	) {
		this.vbo = gl.createBuffer()!;
		this.vao = setupVao(this.vbo);
	}

	clear(): void {
		this.floats = 0;
		this.vertCount = 0;
	}

	private push(
		px: ReadonlyArray<number>,
		py: ReadonlyArray<number>,
		uv: ReadonlyArray<number>,
		slot: number,
		color: RGBA,
	): void {
		const needed = this.floats + TILE_FLOATS * VERTS_PER_QUAD;
		if (needed > this.data.length) {
			const grown = new Float32Array(
				Math.max(needed, this.data.length * 2),
			);
			grown.set(this.data);
			this.data = grown;
		}
		writeTileQuad(this.data, this.floats, px, py, uv, slot, color);
		this.floats += TILE_FLOATS * VERTS_PER_QUAD;
		this.vertCount += VERTS_PER_QUAD;
	}

	tile(
		x: number,
		y: number,
		size: number,
		slot: number,
		quarterTurns = 0,
		flip = false,
		color: RGBA = WHITE,
	): void {
		this.push(
			[x, x + size, x + size, x],
			[y, y, y + size, y + size],
			tileUV(quarterTurns, flip),
			slot,
			color,
		);
	}

	cell(
		centerX: number,
		centerY: number,
		size: number,
		slot: number,
		angle = 0,
		flip = false,
		color: RGBA = WHITE,
	): void {
		const h = size / 2;
		const lx = [-h, h, h, -h];
		const ly = [-h, -h, h, h];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const px: number[] = [];
		const py: number[] = [];
		for (let i = 0; i < 4; i++) {
			px.push(centerX + lx[i]! * cos - ly[i]! * sin);
			py.push(centerY + lx[i]! * sin + ly[i]! * cos);
		}
		this.push(px, py, tileUV(0, flip), slot, color);
	}

	commit(): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.data.subarray(0, this.floats),
			gl.DYNAMIC_DRAW,
		);
	}

	dispose(): void {
		this.gl.deleteBuffer(this.vbo);
		this.gl.deleteVertexArray(this.vao);
	}
}

type QuadFormat = "quad" | "text" | "outline";

type Batch = {
	kind: "batch";
	format: QuadFormat | "tile";
	texture: WebGLTexture;
	blend: QuadBlend;
	start: number;
	count: number;
};

type ScissorBox = { x: number; y: number; w: number; h: number };

type HoldRingCommand = {
	kind: "holdRing";
	frameTex: WebGLTexture;
	iw: number;
	ih: number;
	insets: NineSliceInsets;
	x: number;
	y: number;
	width: number;
	height: number;
	progress: number;
	inner: RGBA;
	fill: RGBA;
	outer: RGBA;
};

type SwayCommand = {
	kind: "sway";
	texture: WebGLTexture;
	px: ReadonlyArray<number>;
	py: ReadonlyArray<number>;
	uv: ReadonlyArray<number>;
	u0: number;
	v0: number;
	u1: number;
	v1: number;
	srcW: number;
	srcH: number;
	color: RGBA;
	blend: QuadBlend;
	amplitude: number;
	rustle: number;
	curve: number;
	rustleFrequency: number;
	phase: number;
	time: number;
	pinnedBase: number;
	flipX: number;
};

type LayerCommand =
	| Batch
	| { kind: "static"; batch: StaticBatch; texture: WebGLTexture }
	| { kind: "raw"; fn: RawLayerFn }
	| { kind: "pushClip"; rect: ClipRect }
	| { kind: "popClip" }
	| HoldRingCommand
	| SwayCommand;

type LayerState = {
	commands: LayerCommand[];
	used: boolean;
	idle: number;
	scratch: RenderTarget;
	/**
	 * False once the layer has queued a command whose result depends on what
	 * the layer is drawn over — an `"additive"` quad, or a raw callback that
	 * owns the bound framebuffer outright. Such a layer must be resolved in
	 * its own target before compositing; see {@link Renderer2D.renderTo}.
	 */
	selfContained: boolean;
};

const ascending = (a: number, b: number): number => a - b;

const writeBlitVertex = (
	out: Float32Array,
	at: number,
	x: number,
	y: number,
	u: number,
	v: number,
): void => {
	out[at] = x;
	out[at + 1] = y;
	out[at + 2] = u;
	out[at + 3] = v;
};

/**
 * How long a layer may go undrawn before its scratch target is released, in
 * seconds.
 *
 * **A duration, not a frame count.** Allocating a full-viewport texture and
 * framebuffer is among the most expensive things a driver does, so eviction must
 * be rare in wall-clock terms. A frame count cannot express that: with the frame
 * rate unlocked the loop runs at thousands of hertz, so any per-frame budget
 * collapses to well under a millisecond and a layer that draws intermittently
 * thrashes its target continuously.
 */
const MAX_IDLE_SECONDS = 2;

const RING_PAD = 2;

type TileArrayEntry = Readonly<{
	array: TileArray;
	columns: number;
	srcSize: number;
}>;

type PrewarmedContext = {
	canvas: HTMLCanvasElement;
	gl: WebGL2RenderingContext;
	tileArrays: Map<TileSource, TileArrayEntry>;
};

export default class Renderer2D {
	private viewport: Viewport;
	private gl: WebGL2RenderingContext;
	private canvas: HTMLCanvasElement;

	private quad!: WorldProgram;
	private text!: WorldProgram;
	private tile!: WorldProgram;
	private quadOutline!: OutlineProgram;
	private quadConicOutline!: ConicOutlineProgram;
	private quadSway!: SwayProgram;
	private blit!: BlitProgram;

	private quadVbo!: WebGLBuffer;
	private quadVao!: WebGLVertexArrayObject;
	private tileVbo!: WebGLBuffer;
	private tileVao!: WebGLVertexArrayObject;
	private blitVbo!: WebGLBuffer;
	private blitVao!: WebGLVertexArrayObject;
	private blitData = new Float32Array(24);
	private immediateVbo: WebGLBuffer | null = null;
	private immediateVao: WebGLVertexArrayObject | null = null;
	private immediateData = new Float32Array(
		QUAD_FLOATS * VERTS_PER_QUAD,
	);
	private holdRingTarget: RenderTarget | null = null;

	private quadData = new Float32Array(
		QUAD_FLOATS * VERTS_PER_QUAD * 1024,
	);
	private quadVerts = 0;
	private tileData = new Float32Array(
		TILE_FLOATS * VERTS_PER_QUAD * 1024,
	);
	private tileVerts = 0;

	private layers = new Map<number, LayerState>();
	private texCache = new WeakMap<TileSource, WebGLTexture>();
	private texelSizes = new WeakMap<
		WebGLTexture,
		readonly [number, number]
	>();
	private tileArrayCache = new Map<TileSource, TileArrayEntry>();
	private fontCache = new WeakMap<LoadedFont, FontAtlas>();
	private whiteTex!: WebGLTexture;
	private colors = new ColorResolver();
	private sceneTargets = new Map<object, RenderTarget>();
	private presentTarget: RenderTarget | null = null;
	private clipStack: ScissorBox[] = [];
	private orderScratch: number[] = [];
	/**
	 * Per-draw scratch for the immediate quad path: corners, texture
	 * coordinates and tinted colours are filled, handed to a vertex writer that
	 * copies them into the batch buffer, and reused by the next draw. Nothing
	 * recorded in a retained command may point at these.
	 */
	private readonly cornerLx: number[] = [0, 0, 0, 0];
	private readonly cornerLy: number[] = [0, 0, 0, 0];
	private readonly cornerPx: number[] = [0, 0, 0, 0];
	private readonly cornerPy: number[] = [0, 0, 0, 0];
	private readonly cornerUv: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
	private readonly imagePx: number[] = [0, 0, 0, 0];
	private readonly imagePy: number[] = [0, 0, 0, 0];
	private readonly imageUv: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
	private readonly imageColor: MutableRGBA = [0, 0, 0, 0];
	private readonly textColor: MutableRGBA = [0, 0, 0, 0];
	private readonly outlineColor: MutableRGBA = [0, 0, 0, 0];
	private readonly shapeColor: MutableRGBA = [0, 0, 0, 0];
	private readonly shapeOutlineColor: MutableRGBA = [0, 0, 0, 0];
	/**
	 * Separate from {@link cornerPx} because a stroked rect holds its four
	 * corners while `strokeSegment` fills a quad per edge, and filling reuses
	 * the corner scratch.
	 */
	private readonly strokeLx: number[] = [0, 0, 0, 0];
	private readonly strokeLy: number[] = [0, 0, 0, 0];
	private readonly strokePx: number[] = [0, 0, 0, 0];
	private readonly strokePy: number[] = [0, 0, 0, 0];
	private rawCtx: MutableRawLayerContext = {
		texW: 0,
		texH: 0,
		spanX: 0,
		spanY: 0,
		originX: 0,
		originY: 0,
	};
	private disposeListeners = new Set<() => void>();
	private contextRestoredListeners = new Set<() => void>();
	private prewarmed: PrewarmedContext | null = null;

	constructor(viewport: Viewport) {
		this.viewport = viewport;
		this.canvas = viewport.element;
		this.gl = this.acquireContext(this.canvas);
		this.buildResources();
		this.installContextListeners(this.canvas);
		registerRenderer(this);
	}

	private acquireContext(
		canvas: HTMLCanvasElement,
	): WebGL2RenderingContext {
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
		});
		if (!gl) {
			throw new Error("WebGL2 not supported.");
		}
		return gl;
	}

	/**
	 * (Re)create every GPU object this renderer owns directly — programs,
	 * staging buffers/VAOs, and the 1x1 white texture — against the current
	 * {@link gl}. Cache-backed GPU state (textures, tile arrays, render targets)
	 * is not touched here; it is dropped and re-baked lazily from CPU-side truth
	 * by the loss/rebuild paths.
	 */
	private buildResources(): void {
		const gl = this.gl;
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		// Load-bearing: every texture this renderer uploads keeps straight
		// (non-premultiplied) alpha, which is what the source factors in
		// `applyQuadBlend` are derived for. Flipping this would silently
		// double-darken normal draws and blow out additive ones.
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

		this.quad = createQuadProgram(gl);
		this.text = createTextProgram(gl);
		this.tile = createTileProgram(gl);
		this.quadOutline = createQuadOutlineProgram(gl);
		this.quadConicOutline = createQuadConicOutlineProgram(gl);
		this.quadSway = createQuadSwayProgram(gl);
		this.blit = createBlitProgram(gl);

		this.quadVbo = gl.createBuffer()!;
		this.quadVao = this.setupQuadVao(this.quadVbo);
		this.tileVbo = gl.createBuffer()!;
		this.tileVao = this.setupTileVao(this.tileVbo);
		this.blitVbo = gl.createBuffer()!;
		this.blitVao = this.setupBlitVao(this.blitVbo);

		this.immediateVbo = null;
		this.immediateVao = null;

		this.whiteTex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([255, 255, 255, 255]),
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
	}

	get width(): number {
		return this.viewport.width;
	}

	get height(): number {
		return this.viewport.height;
	}

	private setupQuadVao(vbo: WebGLBuffer): WebGLVertexArrayObject {
		const gl = this.gl;
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		const stride = QUAD_FLOATS * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
		gl.bindVertexArray(null);
		return vao;
	}

	private setupTileVao(vbo: WebGLBuffer): WebGLVertexArrayObject {
		const gl = this.gl;
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		const stride = TILE_FLOATS * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 20);
		gl.bindVertexArray(null);
		return vao;
	}

	private setupBlitVao(vbo: WebGLBuffer): WebGLVertexArrayObject {
		const gl = this.gl;
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		const stride = 4 * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
		gl.bindVertexArray(null);
		return vao;
	}

	createRenderTarget(): RenderTarget {
		return new RenderTarget(this.gl);
	}

	createStaticBatch(): StaticBatch {
		return new StaticBatch(this.gl, (vbo) => this.setupTileVao(vbo));
	}

	getTileArray(
		source: TileSource,
		columns: number,
		srcSize: number,
	): TileArray {
		const cached = this.tileArrayCache.get(source);
		if (cached) {
			return cached.array;
		}
		const array = this.bakeTileArray(
			this.gl,
			source,
			columns,
			srcSize,
		);
		this.tileArrayCache.set(source, { array, columns, srcSize });
		return array;
	}

	/**
	 * Bake a tileset image into a `TEXTURE_2D_ARRAY` (one layer per tile) in
	 * `gl`. Takes the target context explicitly so it can bake into a
	 * pre-warmed destination context (see {@link prewarm}) as well as the live
	 * one; the caller owns caching the result.
	 */
	private bakeTileArray(
		gl: WebGL2RenderingContext,
		source: TileSource,
		columns: number,
		srcSize: number,
	): TileArray {
		const rows = Math.max(
			1,
			Math.round(sourceHeight(source) / srcSize),
		);
		const count = columns * rows;
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
		gl.texStorage3D(
			gl.TEXTURE_2D_ARRAY,
			1,
			gl.RGBA8,
			srcSize,
			srcSize,
			count,
		);
		gl.texParameteri(
			gl.TEXTURE_2D_ARRAY,
			gl.TEXTURE_MIN_FILTER,
			gl.NEAREST,
		);
		gl.texParameteri(
			gl.TEXTURE_2D_ARRAY,
			gl.TEXTURE_MAG_FILTER,
			gl.NEAREST,
		);
		gl.texParameteri(
			gl.TEXTURE_2D_ARRAY,
			gl.TEXTURE_WRAP_S,
			gl.CLAMP_TO_EDGE,
		);
		gl.texParameteri(
			gl.TEXTURE_2D_ARRAY,
			gl.TEXTURE_WRAP_T,
			gl.CLAMP_TO_EDGE,
		);

		const scratch = new OffscreenCanvas(srcSize, srcSize);
		const sctx = scratch.getContext("2d")!;
		sctx.imageSmoothingEnabled = false;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < columns; col++) {
				sctx.clearRect(0, 0, srcSize, srcSize);
				sctx.drawImage(
					source,
					col * srcSize,
					row * srcSize,
					srcSize,
					srcSize,
					0,
					0,
					srcSize,
					srcSize,
				);
				gl.texSubImage3D(
					gl.TEXTURE_2D_ARRAY,
					0,
					0,
					0,
					row * columns + col,
					srcSize,
					srcSize,
					1,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					scratch,
				);
			}
		}
		return { texture, columns, rows };
	}

	invalidateTileArray(source: TileSource): void {
		const cached = this.tileArrayCache.get(source);
		if (!cached) {
			return;
		}
		this.gl.deleteTexture(cached.array.texture);
		this.tileArrayCache.delete(source);
	}

	invalidateImage(source: TileSource): void {
		const cached = this.texCache.get(source);
		if (!cached) {
			return;
		}
		this.gl.deleteTexture(cached);
		this.texCache.delete(source);
	}

	private getTexture(image: TileSource): WebGLTexture {
		const cached = this.texCache.get(image);
		if (cached) {
			return cached;
		}
		const gl = this.gl;
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			image,
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
		this.texCache.set(image, texture);
		this.texelSizes.set(texture, [
			sourceWidth(image),
			sourceHeight(image),
		]);
		return texture;
	}

	private getFontAtlas(font: LoadedFont): FontAtlas {
		const cached = this.fontCache.get(font);
		if (cached) {
			return cached;
		}
		const atlas = new FontAtlas(this.gl, font);
		this.fontCache.set(font, atlas);
		return atlas;
	}

	private getLayer(id: number): LayerState {
		let layer = this.layers.get(id);
		if (!layer) {
			layer = {
				commands: [],
				used: false,
				idle: 0,
				scratch: this.createRenderTarget(),
				selfContained: true,
			};
			this.layers.set(id, layer);
		}
		layer.used = true;
		layer.idle = 0;
		return layer;
	}

	/**
	 * Set the blend state every composite blit runs under: premultiplied
	 * source-over.
	 *
	 * Layer scratch targets hold premultiplied colour — the per-quad fills
	 * accumulate coverage into them — so compositing one is `ONE` over
	 * `ONE_MINUS_SRC_ALPHA`, not the straight-alpha pair the fills themselves
	 * use. Blend is a per-draw property now (see `applyQuadBlend`); the composite
	 * has exactly this one mode and no caller may vary it.
	 */
	private sourceOver(): void {
		const gl = this.gl;
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}

	private ensureQuadCapacity(): void {
		const needed = (this.quadVerts + VERTS_PER_QUAD) * QUAD_FLOATS;
		if (needed > this.quadData.length) {
			const grown = new Float32Array(
				Math.max(needed, this.quadData.length * 2),
			);
			grown.set(this.quadData);
			this.quadData = grown;
		}
	}

	private ensureTileCapacity(): void {
		const needed = (this.tileVerts + VERTS_PER_QUAD) * TILE_FLOATS;
		if (needed > this.tileData.length) {
			const grown = new Float32Array(
				Math.max(needed, this.tileData.length * 2),
			);
			grown.set(this.tileData);
			this.tileData = grown;
		}
	}

	private recordQuad(
		layer: LayerState,
		format: QuadFormat,
		texture: WebGLTexture,
		blend: QuadBlend,
		start: number,
	): void {
		if (blend === "additive") {
			layer.selfContained = false;
		}
		const last = layer.commands[layer.commands.length - 1];
		if (
			last &&
			last.kind === "batch" &&
			last.format === format &&
			last.texture === texture &&
			last.blend === blend &&
			last.start + last.count === start
		) {
			last.count += VERTS_PER_QUAD;
			return;
		}
		layer.commands.push({
			kind: "batch",
			format,
			texture,
			blend,
			start,
			count: VERTS_PER_QUAD,
		});
	}

	private pushQuadShape(
		id: number,
		texture: WebGLTexture,
		format: QuadFormat,
		px: ReadonlyArray<number>,
		py: ReadonlyArray<number>,
		uv: ReadonlyArray<number>,
		color: RGBA,
		blend: QuadBlend,
	): void {
		const layer = this.getLayer(id);
		this.ensureQuadCapacity();
		const start = this.quadVerts;
		writeQuad(this.quadData, start * QUAD_FLOATS, px, py, uv, color);
		this.quadVerts += VERTS_PER_QUAD;
		this.recordQuad(layer, format, texture, blend, start);
	}

	/**
	 * `color` with its alpha scaled by `alpha`, written into `out`.
	 *
	 * Returns `color` itself when there is nothing to scale, so the common case
	 * touches nothing. Callers that record the result in a retained command must
	 * pass their own array; callers that hand it straight to a vertex writer can
	 * share one of the renderer's scratch colours.
	 */
	private withAlpha(
		color: RGBA,
		alpha: number | undefined,
		out: MutableRGBA,
	): RGBA {
		if (alpha === undefined || alpha === 1) {
			return color;
		}
		out[0] = color[0];
		out[1] = color[1];
		out[2] = color[2];
		out[3] = color[3] * alpha;
		return out;
	}

	private resolveTint(tint?: ColorInput): RGBA {
		return tint ? this.colors.resolve(tint) : WHITE;
	}

	/**
	 * Place `image`'s quad into {@link imagePx}/{@link imagePy}/{@link imageUv},
	 * answering whether there is anything to draw. The buffers stay valid until
	 * the next image draw.
	 */
	private imageQuad(
		image: TileSource,
		opts: DrawImageOpts,
		padTexels: number,
	): boolean {
		if (sourceWidth(image) === 0) {
			return false;
		}
		const iw = sourceWidth(image);
		const ih = sourceHeight(image);
		const sx = opts.srcX ?? 0;
		const sy = opts.srcY ?? 0;
		const sw = opts.srcW ?? iw;
		const sh = opts.srcH ?? ih;
		const padX = (padTexels * opts.width) / sw;
		const padY = (padTexels * opts.height) / sh;
		const hw = opts.width / 2 + padX;
		const hh = opts.height / 2 + padY;
		const lx = this.cornerLx;
		const ly = this.cornerLy;
		lx[0] = -hw;
		lx[1] = hw;
		lx[2] = hw;
		lx[3] = -hw;
		ly[0] = -hh;
		ly[1] = -hh;
		ly[2] = hh;
		ly[3] = hh;
		const px = this.imagePx;
		const py = this.imagePy;
		rotateCornersInto(
			opts.x,
			opts.y,
			lx,
			ly,
			opts.rotation ?? 0,
			px,
			py,
		);
		const shear = opts.shear ?? 0;
		px[0]! += shear;
		px[1]! += shear;
		const du = padTexels / iw;
		const dv = padTexels / ih;
		let u0 = sx / iw - du;
		let u1 = (sx + sw) / iw + du;
		const v0 = sy / ih - dv;
		const v1 = (sy + sh) / ih + dv;
		if (opts.flipX) {
			const t = u0;
			u0 = u1;
			u1 = t;
		}
		const uv = this.imageUv;
		uv[0] = u0;
		uv[1] = v0;
		uv[2] = u1;
		uv[3] = v0;
		uv[4] = u1;
		uv[5] = v1;
		uv[6] = u0;
		uv[7] = v1;
		return true;
	}

	drawImage(
		id: number,
		image: TileSource,
		opts: DrawImageOpts,
	): void {
		if (!this.imageQuad(image, opts, 0)) {
			return;
		}
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
			this.imageColor,
		);
		this.pushQuadShape(
			id,
			this.getTexture(image),
			"quad",
			this.imagePx,
			this.imagePy,
			this.imageUv,
			color,
			opts.blend ?? "normal",
		);
	}

	/**
	 * Draw a sprite bent along its height instead of sheared: see
	 * {@link SwayParams} for the profile. Falls back to {@link drawImage} when
	 * the bend is flat, so still foliage keeps the batched path and costs
	 * nothing extra.
	 *
	 * The quad is widened by the free edge's travel on both sides so the lean
	 * has somewhere to land — the trick `RING_PAD` plays for outlines — and the
	 * fragment stage discards anything outside the sprite's own sub-rect, so a
	 * padded quad over an atlas never drags in its neighbours.
	 *
	 * Per-draw uniforms mean one draw call per swaying sprite; that is the same
	 * bargain `drawHoldRing` makes.
	 *
	 * @example
	 * renderer.drawSwayImage(layer, image, {
	 *   x, y, width, height,
	 *   sway: { lean, rustle, curve: 2, rustleFrequency: 2.5, phase, time, pinnedBase: true },
	 * });
	 */
	drawSwayImage(
		id: number,
		image: TileSource,
		opts: DrawSwayImageOpts,
	): void {
		const { sway } = opts;
		if (sway.lean === 0 && sway.rustle === 0) {
			this.drawImage(id, image, opts);
			return;
		}
		const iw = sourceWidth(image);
		if (iw === 0 || opts.width === 0) {
			return;
		}
		const ih = sourceHeight(image);
		const sx = opts.srcX ?? 0;
		const sy = opts.srcY ?? 0;
		const sw = opts.srcW ?? iw;
		const sh = opts.srcH ?? ih;
		const pad = Math.abs(sway.lean) + Math.abs(sway.rustle);
		const hw = opts.width / 2 + pad;
		const hh = opts.height / 2;
		// A sway command outlives this call, so its geometry cannot live in the
		// shared per-draw scratch.
		const px: number[] = [0, 0, 0, 0];
		const py: number[] = [0, 0, 0, 0];
		const lx = this.cornerLx;
		const ly = this.cornerLy;
		lx[0] = -hw;
		lx[1] = hw;
		lx[2] = hw;
		lx[3] = -hw;
		ly[0] = -hh;
		ly[1] = -hh;
		ly[2] = hh;
		ly[3] = hh;
		rotateCornersInto(
			opts.x,
			opts.y,
			lx,
			ly,
			opts.rotation ?? 0,
			px,
			py,
		);
		const u0 = sx / iw;
		const u1 = (sx + sw) / iw;
		const v0 = sy / ih;
		const v1 = (sy + sh) / ih;
		const du = (pad / opts.width) * (u1 - u0);
		const layer = this.getLayer(id);
		if ((opts.blend ?? "normal") === "additive") {
			layer.selfContained = false;
		}
		layer.commands.push({
			kind: "sway",
			texture: this.getTexture(image),
			px,
			py,
			uv: [u0 - du, v0, u1 + du, v0, u1 + du, v1, u0 - du, v1],
			u0,
			v0,
			u1,
			v1,
			srcW: sw,
			srcH: sh,
			color: this.withAlpha(
				this.resolveTint(opts.tint),
				opts.alpha,
				[0, 0, 0, 0],
			),
			blend: opts.blend ?? "normal",
			amplitude: sway.lean / opts.width,
			rustle: sway.rustle / opts.width,
			curve: Math.max(0.01, sway.curve),
			rustleFrequency: sway.rustleFrequency,
			phase: sway.phase,
			time: sway.time,
			pinnedBase: sway.pinnedBase ? 1 : 0,
			flipX: opts.flipX ? 1 : 0,
		});
	}

	/**
	 * Draw a quad from four arbitrary corners — the escape hatch for geometry
	 * `drawImage` cannot express, such as velocity-stretched particle stripes.
	 * See {@link DrawCornerQuadOpts} for corner order, the affine-only
	 * constraint, and the untextured solid-color form.
	 *
	 * @example
	 * renderer.drawCornerQuad(layer, {
	 *   px: [x - hw, x + hw, x + hw + dx, x - hw + dx],
	 *   py: [y0, y0, y1, y1],
	 *   tint: "#9cf",
	 *   alpha: 0.6,
	 *   blend: "additive",
	 * });
	 */
	drawCornerQuad(id: number, opts: DrawCornerQuadOpts): void {
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
			this.shapeColor,
		);
		if (!opts.image) {
			this.pushQuadShape(
				id,
				this.whiteTex,
				"quad",
				opts.px,
				opts.py,
				SOLID_UV,
				color,
				opts.blend ?? "normal",
			);
			return;
		}
		if (sourceWidth(opts.image) === 0) {
			return;
		}
		this.pushQuadShape(
			id,
			this.getTexture(opts.image),
			"quad",
			opts.px,
			opts.py,
			opts.uv ?? FULL_UV,
			color,
			opts.blend ?? "normal",
		);
	}

	drawImageOutline(
		id: number,
		image: TileSource,
		opts: DrawImageOpts,
	): void {
		if (!this.imageQuad(image, opts, 1)) {
			return;
		}
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
			this.imageColor,
		);
		this.pushQuadShape(
			id,
			this.getTexture(image),
			"outline",
			this.imagePx,
			this.imagePy,
			this.imageUv,
			color,
			opts.blend ?? "normal",
		);
	}

	drawHoldRing(id: number, opts: DrawHoldRingOpts): void {
		if (opts.width <= 0 || opts.height <= 0) {
			return;
		}
		if (sourceWidth(opts.frame) === 0) {
			return;
		}
		const layer = this.getLayer(id);
		layer.commands.push({
			kind: "holdRing",
			frameTex: this.getTexture(opts.frame),
			iw: sourceWidth(opts.frame),
			ih: sourceHeight(opts.frame),
			insets: opts.insets,
			x: opts.x,
			y: opts.y,
			width: opts.width,
			height: opts.height,
			progress: Math.max(0, Math.min(1, opts.progress)),
			inner: this.colors.resolve(opts.inner),
			fill: this.colors.resolve(opts.fill),
			outer: this.colors.resolve(opts.outer),
		});
	}

	drawTile(id: number, opts: DrawTileOpts): void {
		if (opts.tileset.naturalWidth === 0) {
			return;
		}
		const array = this.getTileArray(
			opts.tileset,
			opts.columns,
			opts.srcSize,
		);
		const layer = this.getLayer(id);
		this.ensureTileCapacity();
		const start = this.tileVerts;
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
			this.shapeColor,
		);
		writeTile(
			this.tileData,
			start * TILE_FLOATS,
			opts.x,
			opts.y,
			opts.size,
			opts.slot,
			opts.quarterTurns ?? 0,
			opts.flipX ?? false,
			color,
		);
		this.tileVerts += VERTS_PER_QUAD;
		const blend = opts.blend ?? "normal";
		if (blend === "additive") {
			layer.selfContained = false;
		}
		const last = layer.commands[layer.commands.length - 1];
		if (
			last &&
			last.kind === "batch" &&
			last.format === "tile" &&
			last.texture === array.texture &&
			last.blend === blend &&
			last.start + last.count === start
		) {
			last.count += VERTS_PER_QUAD;
		} else {
			layer.commands.push({
				kind: "batch",
				format: "tile",
				texture: array.texture,
				blend,
				start,
				count: VERTS_PER_QUAD,
			});
		}
	}

	private fillRect(
		id: number,
		x: number,
		y: number,
		w: number,
		h: number,
		rotation: number,
		color: RGBA,
		blend: QuadBlend,
	): void {
		const cx = x + w / 2;
		const cy = y + h / 2;
		const lx = this.cornerLx;
		const ly = this.cornerLy;
		lx[0] = x - cx;
		lx[1] = x + w - cx;
		lx[2] = lx[1];
		lx[3] = lx[0];
		ly[0] = y - cy;
		ly[1] = ly[0];
		ly[2] = y + h - cy;
		ly[3] = ly[2];
		rotateCornersInto(
			cx,
			cy,
			lx,
			ly,
			rotation,
			this.cornerPx,
			this.cornerPy,
		);
		this.pushQuadShape(
			id,
			this.whiteTex,
			"quad",
			this.cornerPx,
			this.cornerPy,
			SOLID_UV,
			color,
			blend,
		);
	}

	drawRect(id: number, opts: DrawRectOpts): void {
		const rotation = opts.rotation ?? 0;
		const blend = opts.blend ?? "normal";
		if (opts.fill) {
			this.fillRect(
				id,
				opts.x,
				opts.y,
				opts.width,
				opts.height,
				rotation,
				this.withAlpha(
					this.colors.resolve(opts.fill),
					opts.alpha,
					this.shapeColor,
				),
				blend,
			);
		}
		if (opts.stroke) {
			const cx = opts.x + opts.width / 2;
			const cy = opts.y + opts.height / 2;
			const lx = this.strokeLx;
			const ly = this.strokeLy;
			lx[0] = opts.x - cx;
			lx[1] = opts.x + opts.width - cx;
			lx[2] = lx[1];
			lx[3] = lx[0];
			ly[0] = opts.y - cy;
			ly[1] = ly[0];
			ly[2] = opts.y + opts.height - cy;
			ly[3] = ly[2];
			const px = this.strokePx;
			const py = this.strokePy;
			rotateCornersInto(cx, cy, lx, ly, rotation, px, py);
			const color = this.withAlpha(
				this.colors.resolve(opts.stroke),
				opts.alpha,
				this.shapeOutlineColor,
			);
			const w = opts.lineWidth ?? 1;
			for (let i = 0; i < 4; i++) {
				const j = (i + 1) % 4;
				this.strokeSegment(
					id,
					px[i]!,
					py[i]!,
					px[j]!,
					py[j]!,
					w,
					color,
					blend,
				);
			}
		}
	}

	private strokeSegment(
		id: number,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		width: number,
		color: RGBA,
		blend: QuadBlend,
	): void {
		const dx = x1 - x0;
		const dy = y1 - y0;
		const len = Math.hypot(dx, dy);
		if (len === 0) {
			return;
		}
		const hw = width / 2;
		const nx = (-dy / len) * hw;
		const ny = (dx / len) * hw;
		const px = [x0 + nx, x1 + nx, x1 - nx, x0 - nx];
		const py = [y0 + ny, y1 + ny, y1 - ny, y0 - ny];
		this.pushQuadShape(
			id,
			this.whiteTex,
			"quad",
			px,
			py,
			SOLID_UV,
			color,
			blend,
		);
	}

	drawLine(
		id: number,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		color: ColorInput,
		width = 1,
		blend: QuadBlend = "normal",
	): void {
		this.strokeSegment(
			id,
			x0,
			y0,
			x1,
			y1,
			width,
			this.colors.resolve(color),
			blend,
		);
	}

	/**
	 * Queue a pre-committed static tile batch. Static batches carry no per-quad
	 * state, so they always draw with `"normal"` blend; anything needing
	 * additive must go through the per-draw quad path.
	 */
	drawStaticBatch(
		id: number,
		batch: StaticBatch,
		texture: WebGLTexture,
	): void {
		if (batch.vertCount === 0) {
			return;
		}
		const layer = this.getLayer(id);
		layer.commands.push({ kind: "static", batch, texture });
	}

	withRawLayer(id: number, fn: RawLayerFn): void {
		const layer = this.getLayer(id);
		layer.selfContained = false;
		layer.commands.push({ kind: "raw", fn });
	}

	pushClip(id: number, rect: ClipRect): void {
		const layer = this.getLayer(id);
		layer.commands.push({
			kind: "pushClip",
			rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
		});
	}

	popClip(id: number): void {
		const layer = this.getLayer(id);
		layer.commands.push({ kind: "popClip" });
	}

	drawText(
		id: number,
		font: LoadedFont,
		text: string,
		x: number,
		y: number,
		opts: DrawTextOpts = {},
	): void {
		const atlas = this.getFontAtlas(font);
		const style = fontStyleOf(opts.bold, opts.italic);
		const count = atlas.layout(
			text,
			x,
			y,
			opts.align ?? "left",
			style,
		);
		const quads = atlas.laidOut;
		const color = this.withAlpha(
			opts.color ? this.colors.resolve(opts.color) : WHITE,
			opts.alpha,
			this.textColor,
		);
		const scale = opts.scale ?? 1;
		const rotation = opts.rotation ?? 0;
		const blend = opts.blend ?? "normal";
		const texture = atlas.texture;
		if (opts.outline) {
			const outline = this.withAlpha(
				this.colors.resolve(opts.outline),
				opts.alpha,
				this.outlineColor,
			);
			for (let o = 0; o < OUTLINE_OFFSETS.length; o++) {
				const offset = OUTLINE_OFFSETS[o]!;
				for (let i = 0; i < count; i++) {
					this.pushGlyphQuad(
						id,
						texture,
						quads[i]!,
						x,
						y,
						offset[0],
						offset[1],
						scale,
						rotation,
						outline,
						blend,
					);
				}
			}
		}
		for (let i = 0; i < count; i++) {
			this.pushGlyphQuad(
				id,
				texture,
				quads[i]!,
				x,
				y,
				0,
				0,
				scale,
				rotation,
				color,
				blend,
			);
		}
	}

	private pushGlyphQuad(
		id: number,
		texture: WebGLTexture,
		q: GlyphQuad,
		anchorX: number,
		anchorY: number,
		offsetX: number,
		offsetY: number,
		scale: number,
		rotation: number,
		color: RGBA,
		blend: QuadBlend,
	): void {
		const x0 = q.x + offsetX;
		const x1 = q.x + q.w + offsetX;
		const y0 = q.y + offsetY;
		const y1 = q.y + q.h + offsetY;
		const lx = this.cornerLx;
		const ly = this.cornerLy;
		lx[0] = (x0 - anchorX) * scale;
		lx[1] = (x1 - anchorX) * scale;
		lx[2] = lx[1];
		lx[3] = lx[0];
		ly[0] = (y0 - anchorY) * scale;
		ly[1] = ly[0];
		ly[2] = (y1 - anchorY) * scale;
		ly[3] = ly[2];
		rotateCornersInto(
			anchorX,
			anchorY,
			lx,
			ly,
			rotation,
			this.cornerPx,
			this.cornerPy,
		);
		const uv = this.cornerUv;
		uv[0] = q.u0;
		uv[1] = q.v0;
		uv[2] = q.u1;
		uv[3] = q.v0;
		uv[4] = q.u1;
		uv[5] = q.v1;
		uv[6] = q.u0;
		uv[7] = q.v1;
		this.pushQuadShape(
			id,
			texture,
			"text",
			this.cornerPx,
			this.cornerPy,
			uv,
			color,
			blend,
		);
	}

	drawGlyph(
		id: number,
		font: LoadedFont,
		glyphId: number,
		style: FontStyle,
		x: number,
		y: number,
		color: ColorInput,
		blend: QuadBlend = "normal",
	): void {
		const atlas = this.getFontAtlas(font);
		const q = atlas.quadAt(glyphId, style, x, y);
		if (!q) {
			return;
		}
		this.pushGlyphQuad(
			id,
			atlas.texture,
			q,
			x,
			y,
			0,
			0,
			1,
			0,
			this.colors.resolve(color),
			blend,
		);
	}

	beginFrame(): void {
		this.quadVerts = 0;
		this.tileVerts = 0;
		for (const layer of this.layers.values()) {
			layer.commands.length = 0;
			layer.used = false;
			layer.selfContained = true;
		}
	}

	private uploadStaging(): void {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.quadData.subarray(0, this.quadVerts * QUAD_FLOATS),
			gl.DYNAMIC_DRAW,
		);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.tileVbo);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.tileData.subarray(0, this.tileVerts * TILE_FLOATS),
			gl.DYNAMIC_DRAW,
		);
	}

	/**
	 * Ids of the layers drawn this frame, ascending, optionally narrowed by
	 * `includeLayer`. Writes into renderer-owned scratch and returns it — the
	 * result is valid only until the next call, and must never be retained.
	 */
	private orderedLayers(
		includeLayer?: (id: number) => boolean,
	): number[] {
		const out = this.orderScratch;
		out.length = 0;
		for (const id of this.layers.keys()) {
			if (!this.layers.get(id)!.used) {
				continue;
			}
			if (includeLayer && !includeLayer(id)) {
				continue;
			}
			out.push(id);
		}
		out.sort(ascending);
		return out;
	}

	resolveColor(input: ColorInput): RGBA {
		return this.colors.resolve(input);
	}

	/**
	 * Composite this frame's layers into `target`, in ascending layer id.
	 *
	 * A layer only needs a render target of its own when its result must exist
	 * as a finished image before it can be combined — when it carries a command
	 * whose output depends on what lies beneath it (see
	 * {@link LayerState.selfContained}). Every other layer draws straight into
	 * `target`, which is exact because both the per-quad and the composite
	 * blend are source-over, and source-over is associative. That
	 * saves a full-viewport clear and a full-viewport blit per layer — the
	 * dominant cost of a frame with little else in it.
	 *
	 * Direct and offscreen layers are handled in one pass so they interleave in
	 * draw order. An empty layer costs nothing either way.
	 */
	renderTo(
		target: RenderTarget,
		includeLayer?: (id: number) => boolean,
		clear = true,
	): void {
		const gl = this.gl;
		const texW = target.width;
		const texH = target.height;
		if (texW <= 0 || texH <= 0) {
			return;
		}
		this.uploadStaging();

		const rawCtx = this.rawCtx;
		rawCtx.texW = texW;
		rawCtx.texH = texH;
		rawCtx.spanX = target.spanX;
		rawCtx.spanY = target.spanY;
		rawCtx.originX = target.originX;
		rawCtx.originY = target.originY;

		const ordered = this.orderedLayers(includeLayer);

		gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		gl.viewport(0, 0, texW, texH);
		this.clipStack.length = 0;
		gl.disable(gl.SCISSOR_TEST);
		if (clear) {
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}

		for (const id of ordered) {
			const layer = this.layers.get(id)!;
			if (layer.commands.length === 0) {
				continue;
			}
			const offscreen = !layer.selfContained;
			const fbo = offscreen ? layer.scratch.fbo : target.fbo;
			if (offscreen) {
				layer.scratch.resize(texW, texH);
				gl.bindFramebuffer(gl.FRAMEBUFFER, layer.scratch.fbo);
				gl.viewport(0, 0, texW, texH);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
			}
			for (const cmd of layer.commands) {
				this.runCommand(cmd, target, rawCtx, texW, texH, fbo);
			}
			this.clipStack.length = 0;
			gl.disable(gl.SCISSOR_TEST);
			if (offscreen) {
				gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
				gl.viewport(0, 0, texW, texH);
				this.sourceOver();
				this.drawBlit(layer.scratch.tex, 1, -1, 1, 1, -1);
			}
		}
		this.clipStack.length = 0;
	}

	clearTarget(target: RenderTarget): void {
		const gl = this.gl;
		if (target.width <= 0 || target.height <= 0) {
			return;
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		gl.viewport(0, 0, target.width, target.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	sceneTarget(key: object): RenderTarget {
		let target = this.sceneTargets.get(key);
		if (!target) {
			target = this.createRenderTarget();
			this.sceneTargets.set(key, target);
		}
		return target;
	}

	releaseSceneTarget(key: object): void {
		const target = this.sceneTargets.get(key);
		if (target) {
			target.dispose();
			this.sceneTargets.delete(key);
		}
	}

	/**
	 * Register a callback fired once when this renderer is disposed, before its
	 * WebGL context is released. Per-renderer resource caches (tile/decoration
	 * batches keyed by renderer, {@link RendererResourceCache}) use this to free
	 * and drop the entry belonging to a view whose renderer is going away.
	 */
	onDispose(listener: () => void): void {
		this.disposeListeners.add(listener);
	}

	/**
	 * Register a callback fired after the WebGL context is rebuilt — either
	 * because the browser restored a lost context, or because the view moved to
	 * another window and {@link rebuild} reacquired a context on a fresh canvas.
	 * Both invalidate **every** GPU object created against the old context,
	 * including those held outside this renderer: per-renderer caches
	 * ({@link RendererResourceCache} of `StaticBatch`es for tilemaps and
	 * decorations) and externally-retained {@link RenderTarget}s must rebuild
	 * their GL state in this callback. Returns an unsubscribe function.
	 *
	 * Render targets vended by {@link sceneTarget} and the renderer's own
	 * caches (plain-image textures, font atlases, tile arrays, layer scratch
	 * targets) are re-created here automatically; only GL objects the renderer
	 * cannot reach need to subscribe.
	 */
	onContextRestored(listener: () => void): () => void {
		this.contextRestoredListeners.add(listener);
		return () => {
			this.contextRestoredListeners.delete(listener);
		};
	}

	private fireContextRestored(): void {
		for (const listener of this.contextRestoredListeners) {
			listener();
		}
	}

	private installContextListeners(canvas: HTMLCanvasElement): void {
		canvas.addEventListener(
			"webglcontextlost",
			this.handleContextLost,
		);
		canvas.addEventListener(
			"webglcontextrestored",
			this.handleContextRestored,
		);
	}

	private removeContextListeners(canvas: HTMLCanvasElement): void {
		canvas.removeEventListener(
			"webglcontextlost",
			this.handleContextLost,
		);
		canvas.removeEventListener(
			"webglcontextrestored",
			this.handleContextRestored,
		);
	}

	private readonly handleContextLost = (event: Event): void => {
		event.preventDefault();
	};

	private readonly handleContextRestored = (): void => {
		this.dropGpuCaches();
		this.buildResources();
		this.rebakeTileArrays();
		this.fireContextRestored();
	};

	/**
	 * Drop references to every cache-backed GPU object. Called when the backing
	 * context is gone (loss or move): the handles are already invalid, so this
	 * only clears CPU-side maps. Textures, font atlases, and render targets
	 * re-create lazily from CPU truth on the next draw; tile arrays are re-baked
	 * eagerly by the caller so a move doesn't stall the first post-move frame.
	 */
	private dropGpuCaches(): void {
		this.texCache = new WeakMap();
		this.texelSizes = new WeakMap();
		this.fontCache = new WeakMap();
		this.layers.clear();
		this.sceneTargets.clear();
		this.presentTarget = null;
		this.holdRingTarget = null;
	}

	private rebakeTileArrays(): void {
		const gl = this.gl;
		for (const [source, entry] of this.tileArrayCache) {
			this.tileArrayCache.set(source, {
				array: this.bakeTileArray(
					gl,
					source,
					entry.columns,
					entry.srcSize,
				),
				columns: entry.columns,
				srcSize: entry.srcSize,
			});
		}
	}

	/**
	 * Pre-build the destination GL state for a cross-window move on `canvas`
	 * (a canvas in the target window's document) while the move is still a ghost
	 * drag, so the drop doesn't hitch. Acquires a context on `canvas` and
	 * re-bakes every cached tile array into it — the dominant upload cost
	 * (one `texSubImage3D` per tile). {@link rebuild} then adopts this context
	 * instead of baking on the drop frame.
	 *
	 * Only one pre-warm is held at a time; calling again (or for a different
	 * canvas) discards the previous one and releases its context. If the move is
	 * cancelled, call {@link discardPrewarm} via {@link dispose} or simply let
	 * the next `prewarm`/`rebuild` supersede it.
	 */
	prewarm(canvas: HTMLCanvasElement): void {
		this.discardPrewarm();
		const gl = this.acquireContext(canvas);
		const tileArrays = new Map<TileSource, TileArrayEntry>();
		for (const [source, entry] of this.tileArrayCache) {
			tileArrays.set(source, {
				array: this.bakeTileArray(
					gl,
					source,
					entry.columns,
					entry.srcSize,
				),
				columns: entry.columns,
				srcSize: entry.srcSize,
			});
		}
		this.prewarmed = { canvas, gl, tileArrays };
	}

	private discardPrewarm(): void {
		if (!this.prewarmed) {
			return;
		}
		this.prewarmed.gl
			.getExtension("WEBGL_lose_context")
			?.loseContext();
		this.prewarmed = null;
	}

	/**
	 * Drop any pending {@link prewarm}, releasing its GL context. Call when a
	 * cross-window move that pre-warmed a destination is cancelled (Esc, snap
	 * home) so the extra context is not held against Chromium's ~16-context cap.
	 */
	cancelPrewarm(): void {
		this.discardPrewarm();
	}

	/**
	 * Rebuild this renderer against the viewport's **current** canvas after a
	 * cross-window move. Call this immediately after
	 * `Viewport.reattach(destContainer)`: the viewport now exposes a fresh
	 * canvas (in the destination document) with no GL context, and this
	 * reacquires a context on it and rebuilds all GPU state.
	 *
	 * If a matching {@link prewarm} exists for the current canvas, its
	 * pre-uploaded tile arrays and context are adopted so the drop frame only
	 * pays for the cheap program/buffer rebuild. The old context is released
	 * (freeing a slot against Chromium's ~16-context cap). Fires
	 * {@link onContextRestored} so external GL holders rebuild.
	 */
	rebuild(): void {
		const canvas = this.viewport.element;
		const oldGl = this.gl;
		const oldCanvas = this.canvas;
		this.removeContextListeners(oldCanvas);
		this.dropGpuCaches();

		if (this.prewarmed && this.prewarmed.canvas === canvas) {
			this.gl = this.prewarmed.gl;
			this.tileArrayCache = this.prewarmed.tileArrays;
			this.prewarmed = null;
			this.buildResources();
		} else {
			this.discardPrewarm();
			this.gl = this.acquireContext(canvas);
			this.buildResources();
			this.rebakeTileArrays();
		}

		this.canvas = canvas;
		if (oldGl !== this.gl) {
			oldGl.getExtension("WEBGL_lose_context")?.loseContext();
		}
		this.installContextListeners(canvas);
		this.fireContextRestored();
	}

	dispose(): void {
		const gl = this.gl;
		unregisterRenderer(this);
		this.removeContextListeners(this.canvas);
		this.discardPrewarm();
		for (const listener of this.disposeListeners) {
			listener();
		}
		this.disposeListeners.clear();
		this.contextRestoredListeners.clear();
		for (const target of this.sceneTargets.values()) {
			target.dispose();
		}
		this.sceneTargets.clear();
		this.presentTarget?.dispose();
		this.presentTarget = null;
		this.holdRingTarget?.dispose();
		this.holdRingTarget = null;
		for (const layer of this.layers.values()) {
			layer.scratch.dispose();
		}
		this.layers.clear();
		for (const entry of this.tileArrayCache.values()) {
			gl.deleteTexture(entry.array.texture);
		}
		this.tileArrayCache.clear();
		gl.deleteTexture(this.whiteTex);
		gl.deleteBuffer(this.quadVbo);
		gl.deleteVertexArray(this.quadVao);
		gl.deleteBuffer(this.tileVbo);
		gl.deleteVertexArray(this.tileVao);
		gl.deleteBuffer(this.blitVbo);
		gl.deleteVertexArray(this.blitVao);
		if (this.immediateVbo) {
			gl.deleteBuffer(this.immediateVbo);
		}
		if (this.immediateVao) {
			gl.deleteVertexArray(this.immediateVao);
		}
		gl.deleteProgram(this.quad.program);
		gl.deleteProgram(this.text.program);
		gl.deleteProgram(this.tile.program);
		gl.deleteProgram(this.quadOutline.program);
		gl.deleteProgram(this.quadConicOutline.program);
		gl.deleteProgram(this.quadSway.program);
		gl.deleteProgram(this.blit.program);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}

	private clipToScissor(
		rect: ClipRect,
		target: RenderTarget,
		texW: number,
		texH: number,
	): ScissorBox {
		const spanX = target.spanX || texW;
		const spanY = target.spanY || texH;
		const left = ((rect.x - target.originX) / spanX) * texW;
		const right = ((rect.x + rect.w - target.originX) / spanX) * texW;
		const topPx = ((rect.y - target.originY) / spanY) * texH;
		const bottomPx =
			((rect.y + rect.h - target.originY) / spanY) * texH;
		const x = Math.round(left);
		const w = Math.max(0, Math.round(right) - x);
		const yTop = Math.round(topPx);
		const yBottom = Math.round(bottomPx);
		const h = Math.max(0, yBottom - yTop);
		return { x, y: texH - yBottom, w, h };
	}

	private runCommand(
		cmd: LayerCommand,
		target: RenderTarget,
		rawCtx: RawLayerContext,
		texW: number,
		texH: number,
		destFbo: WebGLFramebuffer,
	): void {
		const gl = this.gl;
		if (cmd.kind === "raw") {
			cmd.fn(gl, rawCtx);
			gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
			gl.viewport(0, 0, texW, texH);
			return;
		}
		if (cmd.kind === "pushClip") {
			const box = this.clipToScissor(cmd.rect, target, texW, texH);
			const top = this.clipStack[this.clipStack.length - 1];
			const next = top ? intersectScissor(top, box) : box;
			this.clipStack.push(next);
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(next.x, next.y, next.w, next.h);
			return;
		}
		if (cmd.kind === "popClip") {
			this.clipStack.pop();
			const top = this.clipStack[this.clipStack.length - 1];
			if (top) {
				gl.enable(gl.SCISSOR_TEST);
				gl.scissor(top.x, top.y, top.w, top.h);
			} else {
				gl.disable(gl.SCISSOR_TEST);
			}
			return;
		}
		if (cmd.kind === "holdRing") {
			this.paintHoldRing(cmd, target, texW, texH, destFbo);
			return;
		}
		if (cmd.kind === "sway") {
			this.paintSway(cmd, target);
			return;
		}
		if (cmd.kind === "static") {
			applyQuadBlend(gl, "normal");
			const prog = this.tile;
			gl.useProgram(prog.program);
			gl.uniform2f(prog.uResolution, target.spanX, target.spanY);
			gl.uniform2f(prog.uOrigin, target.originX, target.originY);
			gl.uniform1i(prog.uSampler, 0);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, cmd.texture);
			gl.bindVertexArray(cmd.batch.vao);
			gl.drawArrays(gl.TRIANGLES, 0, cmd.batch.vertCount);
			gl.bindVertexArray(null);
			return;
		}
		applyQuadBlend(gl, cmd.blend);
		const prog =
			cmd.format === "tile"
				? this.tile
				: cmd.format === "text"
					? this.text
					: cmd.format === "outline"
						? this.quadOutline
						: this.quad;
		gl.useProgram(prog.program);
		gl.uniform2f(prog.uResolution, target.spanX, target.spanY);
		gl.uniform2f(prog.uOrigin, target.originX, target.originY);
		gl.uniform1i(prog.uSampler, 0);
		if (cmd.format === "outline") {
			const size = this.texelSizes.get(cmd.texture);
			gl.uniform2f(
				this.quadOutline.uTexel,
				size ? 1 / size[0] : 0,
				size ? 1 / size[1] : 0,
			);
		}
		gl.activeTexture(gl.TEXTURE0);
		if (cmd.format === "tile") {
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, cmd.texture);
			gl.bindVertexArray(this.tileVao);
		} else {
			gl.bindTexture(gl.TEXTURE_2D, cmd.texture);
			gl.bindVertexArray(this.quadVao);
		}
		gl.drawArrays(gl.TRIANGLES, cmd.start, cmd.count);
		gl.bindVertexArray(null);
	}

	private ensureImmediate(): {
		vbo: WebGLBuffer;
		vao: WebGLVertexArrayObject;
	} {
		if (!this.immediateVbo || !this.immediateVao) {
			this.immediateVbo = this.gl.createBuffer()!;
			this.immediateVao = this.setupQuadVao(this.immediateVbo);
		}
		return { vbo: this.immediateVbo, vao: this.immediateVao };
	}

	private drawImmediateQuad(
		program: WebGLProgram,
		texture: WebGLTexture,
		px: ReadonlyArray<number>,
		py: ReadonlyArray<number>,
		uv: ReadonlyArray<number>,
		color: RGBA = WHITE,
	): void {
		const gl = this.gl;
		const { vbo, vao } = this.ensureImmediate();
		writeQuad(this.immediateData, 0, px, py, uv, color);
		gl.useProgram(program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			this.immediateData,
			gl.DYNAMIC_DRAW,
		);
		gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_QUAD);
		gl.bindVertexArray(null);
	}

	private paintSway(cmd: SwayCommand, target: RenderTarget): void {
		const gl = this.gl;
		applyQuadBlend(gl, cmd.blend);
		const prog = this.quadSway;
		gl.useProgram(prog.program);
		gl.uniform2f(prog.uResolution, target.spanX, target.spanY);
		gl.uniform2f(prog.uOrigin, target.originX, target.originY);
		gl.uniform1i(prog.uSampler, 0);
		gl.uniform4f(prog.uRect, cmd.u0, cmd.v0, cmd.u1, cmd.v1);
		gl.uniform2f(prog.uSrcSize, cmd.srcW, cmd.srcH);
		gl.uniform1f(prog.uAmplitude, cmd.amplitude);
		gl.uniform1f(prog.uCurve, cmd.curve);
		gl.uniform1f(prog.uRustle, cmd.rustle);
		gl.uniform1f(prog.uRustleFrequency, cmd.rustleFrequency);
		gl.uniform1f(prog.uPhase, cmd.phase);
		gl.uniform1f(prog.uTime, cmd.time);
		gl.uniform1f(prog.uPinnedBase, cmd.pinnedBase);
		gl.uniform1f(prog.uFlipX, cmd.flipX);
		this.drawImmediateQuad(
			prog.program,
			cmd.texture,
			cmd.px,
			cmd.py,
			cmd.uv,
			cmd.color,
		);
	}

	private paintHoldRing(
		cmd: HoldRingCommand,
		target: RenderTarget,
		texW: number,
		texH: number,
		destFbo: WebGLFramebuffer,
	): void {
		const gl = this.gl;
		const rtW = Math.max(1, Math.round(cmd.width));
		const rtH = Math.max(1, Math.round(cmd.height));
		const rt = (this.holdRingTarget ??= new RenderTarget(gl));
		rt.resize(rtW, rtH);

		gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
		gl.viewport(0, 0, rtW, rtH);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		applyQuadBlend(gl, "normal");
		const quadProg = this.quad;
		gl.useProgram(quadProg.program);
		gl.uniform2f(quadProg.uResolution, cmd.width, cmd.height);
		gl.uniform2f(quadProg.uOrigin, 0, 0);
		gl.uniform1i(quadProg.uSampler, 0);
		const cells = nineSliceCells(cmd.iw, cmd.ih, {
			x: 0,
			y: 0,
			width: cmd.width,
			height: cmd.height,
			insets: cmd.insets,
		});
		for (const cell of cells) {
			const u0 = cell.srcX / cmd.iw;
			const u1 = (cell.srcX + cell.srcW) / cmd.iw;
			const v0 = cell.srcY / cmd.ih;
			const v1 = (cell.srcY + cell.srcH) / cmd.ih;
			this.drawImmediateQuad(
				quadProg.program,
				cmd.frameTex,
				[
					cell.dstX,
					cell.dstX + cell.dstW,
					cell.dstX + cell.dstW,
					cell.dstX,
				],
				[
					cell.dstY,
					cell.dstY,
					cell.dstY + cell.dstH,
					cell.dstY + cell.dstH,
				],
				[u0, v0, u1, v0, u1, v1, u0, v1],
			);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo);
		gl.viewport(0, 0, texW, texH);
		applyQuadBlend(gl, "normal");
		const prog = this.quadConicOutline;
		gl.useProgram(prog.program);
		gl.uniform2f(prog.uResolution, target.spanX, target.spanY);
		gl.uniform2f(prog.uOrigin, target.originX, target.originY);
		gl.uniform1i(prog.uSampler, 0);
		gl.uniform2f(prog.uTexel, 1 / cmd.width, 1 / cmd.height);
		gl.uniform1f(prog.uProgress, cmd.progress);
		gl.uniform4fv(prog.uInner, cmd.inner);
		gl.uniform4fv(prog.uFill, cmd.fill);
		gl.uniform4fv(prog.uOuter, cmd.outer);
		const x0 = cmd.x - RING_PAD;
		const x1 = cmd.x + cmd.width + RING_PAD;
		const y0 = cmd.y - RING_PAD;
		const y1 = cmd.y + cmd.height + RING_PAD;
		const ou = RING_PAD / cmd.width;
		const ov = RING_PAD / cmd.height;
		this.drawImmediateQuad(
			prog.program,
			rt.tex,
			[x0, x1, x1, x0],
			[y0, y0, y1, y1],
			[-ou, 1 + ov, 1 + ou, 1 + ov, 1 + ou, -ov, -ou, -ov],
		);
	}

	private drawBlit(
		texture: WebGLTexture,
		opacity: number,
		left: number,
		top: number,
		right: number,
		bottom: number,
	): void {
		const gl = this.gl;
		const d = this.blitData;
		writeBlitVertex(d, 0, left, top, 0, 1);
		writeBlitVertex(d, 4, right, top, 1, 1);
		writeBlitVertex(d, 8, right, bottom, 1, 0);
		writeBlitVertex(d, 12, left, top, 0, 1);
		writeBlitVertex(d, 16, right, bottom, 1, 0);
		writeBlitVertex(d, 20, left, bottom, 0, 0);
		gl.useProgram(this.blit.program);
		gl.uniform1i(this.blit.uTex, 0);
		gl.uniform1f(this.blit.uOpacity, opacity);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.bindVertexArray(this.blitVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.blitVbo);
		gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.bindVertexArray(null);
	}

	composite(
		targets: ReadonlyArray<RenderTarget>,
		dest: PresentDest,
	): void {
		const gl = this.gl;
		const vw = this.viewport.width;
		const vh = this.viewport.height;
		if (vw <= 0 || vh <= 0) {
			return;
		}

		const present = (this.presentTarget ??= new RenderTarget(gl));
		present.resize(vw, vh);

		gl.bindFramebuffer(gl.FRAMEBUFFER, present.fbo);
		gl.viewport(0, 0, vw, vh);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		const left = (dest.x / vw) * 2 - 1;
		const right = ((dest.x + dest.w) / vw) * 2 - 1;
		const top = 1 - (dest.y / vh) * 2;
		const bottom = 1 - ((dest.y + dest.h) / vh) * 2;
		this.sourceOver();
		for (const target of targets) {
			this.drawBlit(target.tex, 1, left, top, right, bottom);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, vw, vh);
		this.sourceOver();
		this.drawBlit(present.tex, 1, -1, 1, 1, -1);
	}

	endFrame(): void {
		const now = performance.now();
		for (const [id, layer] of this.layers) {
			if (layer.used) {
				continue;
			}
			if (layer.idle === 0) {
				layer.idle = now;
			} else if (now - layer.idle > MAX_IDLE_SECONDS * 1000) {
				layer.scratch.dispose();
				this.layers.delete(id);
			}
		}
	}
}
