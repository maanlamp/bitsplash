import type Viewport from "../camera/viewport";
import {
	type FontStyle,
	type LoadedFont,
	STYLE_BOLD,
	STYLE_ITALIC,
	STYLE_REGULAR,
} from "../load";
import {
	applyCompositeBlend,
	applyLayerBlend,
	BlendMode,
} from "../render/blend";
import {
	type ColorInput,
	ColorResolver,
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
	createTextProgram,
	createTileProgram,
	type OutlineProgram,
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
const TRANSPARENT: RGBA = [0, 0, 0, 0];

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
}>;

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
	const order = [0, 1, 2, 0, 2, 3];
	let p = o;
	for (const i of order) {
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
	const order = [0, 1, 2, 0, 2, 3];
	let p = o;
	for (const i of order) {
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

const rotateCorners = (
	cx: number,
	cy: number,
	lx: ReadonlyArray<number>,
	ly: ReadonlyArray<number>,
	rotation: number,
): { px: number[]; py: number[] } => {
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const px: number[] = [];
	const py: number[] = [];
	for (let i = 0; i < 4; i++) {
		px.push(cx + lx[i]! * cos - ly[i]! * sin);
		py.push(cy + lx[i]! * sin + ly[i]! * cos);
	}
	return { px, py };
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

type LayerCommand =
	| Batch
	| { kind: "static"; batch: StaticBatch; texture: WebGLTexture }
	| { kind: "raw"; fn: RawLayerFn }
	| { kind: "pushClip"; rect: ClipRect }
	| { kind: "popClip" }
	| HoldRingCommand;

type LayerState = {
	commands: LayerCommand[];
	used: boolean;
	idle: number;
	scratch: RenderTarget;
	blend: BlendMode;
	opacity: number;
};

const MAX_IDLE = 2;
const RING_PAD = 2;

export default class Renderer2D {
	private viewport: Viewport;
	private gl: WebGL2RenderingContext;

	private quad: WorldProgram;
	private text: WorldProgram;
	private tile: WorldProgram;
	private quadOutline: OutlineProgram;
	private quadConicOutline: ConicOutlineProgram;
	private blit: BlitProgram;

	private quadVbo: WebGLBuffer;
	private quadVao: WebGLVertexArrayObject;
	private tileVbo: WebGLBuffer;
	private tileVao: WebGLVertexArrayObject;
	private blitVbo: WebGLBuffer;
	private blitVao: WebGLVertexArrayObject;
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
	private tileArrayCache = new Map<TileSource, TileArray>();
	private fontCache = new WeakMap<LoadedFont, FontAtlas>();
	private whiteTex: WebGLTexture;
	private colors = new ColorResolver();
	private sceneTargets = new Map<object, RenderTarget>();
	private presentTarget: RenderTarget | null = null;
	private clipStack: ScissorBox[] = [];
	private disposeListeners = new Set<() => void>();

	constructor(viewport: Viewport) {
		this.viewport = viewport;
		const gl = viewport.element.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
		});
		if (!gl) {
			throw new Error("WebGL2 not supported.");
		}
		this.gl = gl;
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

		this.quad = createQuadProgram(gl);
		this.text = createTextProgram(gl);
		this.tile = createTileProgram(gl);
		this.quadOutline = createQuadOutlineProgram(gl);
		this.quadConicOutline = createQuadConicOutlineProgram(gl);
		this.blit = createBlitProgram(gl);

		this.quadVbo = gl.createBuffer()!;
		this.quadVao = this.setupQuadVao(this.quadVbo);
		this.tileVbo = gl.createBuffer()!;
		this.tileVao = this.setupTileVao(this.tileVbo);
		this.blitVbo = gl.createBuffer()!;
		this.blitVao = this.setupBlitVao(this.blitVbo);

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
		registerRenderer(this);
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
			return cached;
		}
		const gl = this.gl;
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
		const result: TileArray = { texture, columns, rows };
		this.tileArrayCache.set(source, result);
		return result;
	}

	invalidateTileArray(source: TileSource): void {
		const cached = this.tileArrayCache.get(source);
		if (!cached) {
			return;
		}
		this.gl.deleteTexture(cached.texture);
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
				blend: BlendMode.NORMAL,
				opacity: 1,
			};
			this.layers.set(id, layer);
		}
		layer.used = true;
		layer.idle = 0;
		return layer;
	}

	setLayerBlend(id: number, blend: BlendMode, opacity = 1): void {
		const layer = this.getLayer(id);
		layer.blend = blend;
		layer.opacity = opacity;
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
		start: number,
	): void {
		const last = layer.commands[layer.commands.length - 1];
		if (
			last &&
			last.kind === "batch" &&
			last.format === format &&
			last.texture === texture &&
			last.start + last.count === start
		) {
			last.count += VERTS_PER_QUAD;
			return;
		}
		layer.commands.push({
			kind: "batch",
			format,
			texture,
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
	): void {
		const layer = this.getLayer(id);
		this.ensureQuadCapacity();
		const start = this.quadVerts;
		writeQuad(this.quadData, start * QUAD_FLOATS, px, py, uv, color);
		this.quadVerts += VERTS_PER_QUAD;
		this.recordQuad(layer, format, texture, start);
	}

	private withAlpha(color: RGBA, alpha?: number): RGBA {
		if (alpha === undefined || alpha === 1) {
			return color;
		}
		return [color[0], color[1], color[2], color[3] * alpha];
	}

	private resolveTint(tint?: ColorInput): RGBA {
		return tint ? this.colors.resolve(tint) : WHITE;
	}

	private imageQuad(
		image: TileSource,
		opts: DrawImageOpts,
		padTexels: number,
	): { px: number[]; py: number[]; uv: number[] } | null {
		if (sourceWidth(image) === 0) {
			return null;
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
		const lx = [-hw, hw, hw, -hw];
		const ly = [-hh, -hh, hh, hh];
		const { px, py } = rotateCorners(
			opts.x,
			opts.y,
			lx,
			ly,
			opts.rotation ?? 0,
		);
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
		return { px, py, uv: [u0, v0, u1, v0, u1, v1, u0, v1] };
	}

	drawImage(
		id: number,
		image: TileSource,
		opts: DrawImageOpts,
	): void {
		const quad = this.imageQuad(image, opts, 0);
		if (!quad) {
			return;
		}
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
		);
		this.pushQuadShape(
			id,
			this.getTexture(image),
			"quad",
			quad.px,
			quad.py,
			quad.uv,
			color,
		);
	}

	drawImageOutline(
		id: number,
		image: TileSource,
		opts: DrawImageOpts,
	): void {
		const quad = this.imageQuad(image, opts, 1);
		if (!quad) {
			return;
		}
		const color = this.withAlpha(
			this.resolveTint(opts.tint),
			opts.alpha,
		);
		this.pushQuadShape(
			id,
			this.getTexture(image),
			"outline",
			quad.px,
			quad.py,
			quad.uv,
			color,
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
		const last = layer.commands[layer.commands.length - 1];
		if (
			last &&
			last.kind === "batch" &&
			last.format === "tile" &&
			last.texture === array.texture &&
			last.start + last.count === start
		) {
			last.count += VERTS_PER_QUAD;
		} else {
			layer.commands.push({
				kind: "batch",
				format: "tile",
				texture: array.texture,
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
	): void {
		const cx = x + w / 2;
		const cy = y + h / 2;
		const lx = [x - cx, x + w - cx, x + w - cx, x - cx];
		const ly = [y - cy, y - cy, y + h - cy, y + h - cy];
		const { px, py } = rotateCorners(cx, cy, lx, ly, rotation);
		this.pushQuadShape(
			id,
			this.whiteTex,
			"quad",
			px,
			py,
			[0, 0, 0, 0, 0, 0, 0, 0],
			color,
		);
	}

	drawRect(id: number, opts: DrawRectOpts): void {
		const rotation = opts.rotation ?? 0;
		if (opts.fill) {
			this.fillRect(
				id,
				opts.x,
				opts.y,
				opts.width,
				opts.height,
				rotation,
				this.withAlpha(this.colors.resolve(opts.fill), opts.alpha),
			);
		}
		if (opts.stroke) {
			const cx = opts.x + opts.width / 2;
			const cy = opts.y + opts.height / 2;
			const lx = [
				opts.x - cx,
				opts.x + opts.width - cx,
				opts.x + opts.width - cx,
				opts.x - cx,
			];
			const ly = [
				opts.y - cy,
				opts.y - cy,
				opts.y + opts.height - cy,
				opts.y + opts.height - cy,
			];
			const { px, py } = rotateCorners(cx, cy, lx, ly, rotation);
			const color = this.withAlpha(
				this.colors.resolve(opts.stroke),
				opts.alpha,
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
			[0, 0, 0, 0, 0, 0, 0, 0],
			color,
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
	): void {
		this.strokeSegment(
			id,
			x0,
			y0,
			x1,
			y1,
			width,
			this.colors.resolve(color),
		);
	}

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
		const style = ((opts.bold ? STYLE_BOLD : STYLE_REGULAR) |
			(opts.italic ? STYLE_ITALIC : STYLE_REGULAR)) as FontStyle;
		const quads = atlas.layout(
			text,
			x,
			y,
			opts.align ?? "left",
			style,
		);
		const color = this.withAlpha(
			opts.color ? this.colors.resolve(opts.color) : WHITE,
			opts.alpha,
		);
		const scale = opts.scale ?? 1;
		const rotation = opts.rotation ?? 0;
		const texture = atlas.texture;
		if (opts.outline) {
			const outline = this.withAlpha(
				this.colors.resolve(opts.outline),
				opts.alpha,
			);
			for (const [ox, oy] of OUTLINE_OFFSETS) {
				for (const q of quads) {
					this.pushGlyphQuad(
						id,
						texture,
						q,
						x,
						y,
						ox,
						oy,
						scale,
						rotation,
						outline,
					);
				}
			}
		}
		for (const q of quads) {
			this.pushGlyphQuad(
				id,
				texture,
				q,
				x,
				y,
				0,
				0,
				scale,
				rotation,
				color,
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
	): void {
		const x0 = q.x + offsetX;
		const x1 = q.x + q.w + offsetX;
		const y0 = q.y + offsetY;
		const y1 = q.y + q.h + offsetY;
		const lx = [
			(x0 - anchorX) * scale,
			(x1 - anchorX) * scale,
			(x1 - anchorX) * scale,
			(x0 - anchorX) * scale,
		];
		const ly = [
			(y0 - anchorY) * scale,
			(y0 - anchorY) * scale,
			(y1 - anchorY) * scale,
			(y1 - anchorY) * scale,
		];
		const { px, py } = rotateCorners(
			anchorX,
			anchorY,
			lx,
			ly,
			rotation,
		);
		this.pushQuadShape(
			id,
			texture,
			"text",
			px,
			py,
			[q.u0, q.v0, q.u1, q.v0, q.u1, q.v1, q.u0, q.v1],
			color,
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
		);
	}

	beginFrame(): void {
		this.quadVerts = 0;
		this.tileVerts = 0;
		for (const layer of this.layers.values()) {
			layer.commands.length = 0;
			layer.used = false;
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

	private orderedLayers(): number[] {
		return [...this.layers.keys()]
			.filter((id) => this.layers.get(id)!.used)
			.sort((a, b) => a - b);
	}

	resolveColor(input: ColorInput): RGBA {
		return this.colors.resolve(input);
	}

	renderTo(
		target: RenderTarget,
		includeLayer?: (id: number) => boolean,
		clear = true,
		clearColor: RGBA = TRANSPARENT,
	): void {
		const gl = this.gl;
		const texW = target.width;
		const texH = target.height;
		if (texW <= 0 || texH <= 0) {
			return;
		}
		this.uploadStaging();

		const rawCtx: RawLayerContext = {
			texW,
			texH,
			spanX: target.spanX,
			spanY: target.spanY,
			originX: target.originX,
			originY: target.originY,
		};

		const ordered = includeLayer
			? this.orderedLayers().filter(includeLayer)
			: this.orderedLayers();
		for (const id of ordered) {
			const layer = this.layers.get(id)!;
			layer.scratch.resize(texW, texH);
			gl.bindFramebuffer(gl.FRAMEBUFFER, layer.scratch.fbo);
			gl.viewport(0, 0, texW, texH);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			this.clipStack.length = 0;
			gl.disable(gl.SCISSOR_TEST);
			for (const cmd of layer.commands) {
				this.runCommand(
					cmd,
					target,
					rawCtx,
					texW,
					texH,
					layer.scratch.fbo,
				);
			}
			gl.disable(gl.SCISSOR_TEST);
		}
		this.clipStack.length = 0;

		gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		gl.viewport(0, 0, texW, texH);
		if (clear) {
			gl.clearColor(
				clearColor[0],
				clearColor[1],
				clearColor[2],
				clearColor[3],
			);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
		for (const id of ordered) {
			const layer = this.layers.get(id)!;
			applyCompositeBlend(gl, layer.blend);
			this.drawBlit(layer.scratch.tex, layer.opacity, -1, 1, 1, -1);
		}
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

	dispose(): void {
		const gl = this.gl;
		unregisterRenderer(this);
		for (const listener of this.disposeListeners) {
			listener();
		}
		this.disposeListeners.clear();
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
		for (const array of this.tileArrayCache.values()) {
			gl.deleteTexture(array.texture);
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
		scratchFbo: WebGLFramebuffer,
	): void {
		const gl = this.gl;
		if (cmd.kind === "raw") {
			cmd.fn(gl, rawCtx);
			gl.bindFramebuffer(gl.FRAMEBUFFER, scratchFbo);
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
			this.paintHoldRing(cmd, target, texW, texH, scratchFbo);
			return;
		}
		applyLayerBlend(gl);
		if (cmd.kind === "static") {
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
	): void {
		const gl = this.gl;
		const { vbo, vao } = this.ensureImmediate();
		writeQuad(this.immediateData, 0, px, py, uv, WHITE);
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

	private paintHoldRing(
		cmd: HoldRingCommand,
		target: RenderTarget,
		texW: number,
		texH: number,
		scratchFbo: WebGLFramebuffer,
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
		applyLayerBlend(gl);
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

		gl.bindFramebuffer(gl.FRAMEBUFFER, scratchFbo);
		gl.viewport(0, 0, texW, texH);
		applyLayerBlend(gl);
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
		d.set([
			left,
			top,
			0,
			1,
			right,
			top,
			1,
			1,
			right,
			bottom,
			1,
			0,
			left,
			top,
			0,
			1,
			right,
			bottom,
			1,
			0,
			left,
			bottom,
			0,
			0,
		]);
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
		applyCompositeBlend(gl, BlendMode.NORMAL);
		for (const target of targets) {
			this.drawBlit(target.tex, 1, left, top, right, bottom);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, vw, vh);
		applyCompositeBlend(gl, BlendMode.NORMAL);
		this.drawBlit(present.tex, 1, -1, 1, 1, -1);
	}

	endFrame(): void {
		for (const [id, layer] of this.layers) {
			if (layer.used) {
				continue;
			}
			layer.idle++;
			if (layer.idle > MAX_IDLE) {
				layer.scratch.dispose();
				this.layers.delete(id);
			}
		}
	}
}
