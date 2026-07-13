import { type LoadedFont, STYLE_REGULAR } from "../../load";
import type { ColorInput } from "../../render/color-resolver";
import {
	drawNineSlice,
	type NineSliceInsets,
} from "../../render/nine-slice";
import type { TileSource } from "../../render/renderer-2d";
import { resolveRenderLayer } from "../../render/render-layers";
import { type RenderContext, RenderSystem } from "../../system";
import { resolveFont } from "../../text/resolve-font";
import type { RichLine } from "../../text/rich-text";
import { measureText } from "../../text/text-layout";

const GLYPH_DEFAULT: ColorInput = [0, 0, 0, 1];

const baselineEx = (font: LoadedFont): number => {
	const face = font.faces[STYLE_REGULAR];
	if (!face) {
		return font.ascent / 2;
	}
	const glyph = face.glyphCache.get(face.shape.glyphId(120));
	return glyph ? glyph.bearingY : font.ascent / 2;
};

type InkBounds = Readonly<{
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}>;

const inkBounds = (
	font: LoadedFont,
	content: string,
): InkBounds | null => {
	const face = font.faces[STYLE_REGULAR];
	if (!face) {
		return null;
	}
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let pen = 0;
	for (const char of content) {
		const codePoint = char.codePointAt(0);
		if (codePoint !== undefined) {
			const glyph = face.glyphCache.get(
				face.shape.glyphId(codePoint),
			);
			if (glyph && glyph.width > 0 && glyph.rows > 0) {
				const left = pen + glyph.bearingX;
				minX = Math.min(minX, left);
				maxX = Math.max(maxX, left + glyph.width);
				minY = Math.min(minY, -glyph.bearingY);
				maxY = Math.max(maxY, glyph.rows - glyph.bearingY);
			}
		}
		pen += measureText(font, char);
	}
	if (maxX < minX || maxY < minY) {
		return null;
	}
	return { minX, maxX, minY, maxY };
};
import { UI_LAYER_MIN } from "../../ui";
import type { DynStore } from "../bypass/dyn-store";
import type { UiNode } from "../reconciler/ui-node";
import type { UiRoot } from "../reconciler/ui-root";
import type { Style } from "../style/style";

export type UiFontProvider = (
	ctx: RenderContext,
) => LoadedFont | null | undefined;

const styleOf = (node: UiNode): Style | undefined =>
	node.props.style as Style | undefined;

const isOverflowHidden = (style: Style | undefined): boolean =>
	(style as { overflow?: string } | undefined)?.overflow === "hidden";

export class UiRenderSystem extends RenderSystem {
	constructor(
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
		private readonly font: UiFontProvider,
	) {
		super();
	}

	render(ctx: RenderContext): void {
		const font = this.font(ctx) ?? undefined;
		for (const child of this.root.tree.children) {
			this.paint(child, ctx, UI_LAYER_MIN, 1, 0, 0, font);
		}
	}

	private paint(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		inheritedAlpha: number,
		inheritedOffsetX: number,
		inheritedOffsetY: number,
		font: LoadedFont | undefined,
	): void {
		if (!this.dyn.isVisible(node)) {
			return;
		}
		const rect = node.layoutRect;
		if (!rect) {
			return;
		}
		const style = styleOf(node);
		const alpha = inheritedAlpha * this.dyn.alpha(node, style);
		if (alpha <= 0) {
			return;
		}
		const worldLayerName = node.props.worldLayer as
			| string
			| undefined;
		let offsetX: number;
		let offsetY: number;
		let paintLayer = layer;
		if (worldLayerName !== undefined) {
			paintLayer = resolveRenderLayer(ctx.ecs, worldLayerName);
			const values = this.dyn.get(node.id);
			if (
				values?.worldX === undefined ||
				values?.worldY === undefined
			) {
				return;
			}
			offsetX = values.worldX - rect.x;
			offsetY = values.worldY - rect.y;
		} else {
			offsetX = inheritedOffsetX + this.dyn.offsetX(node);
			offsetY = inheritedOffsetY + this.dyn.offsetY(node);
		}
		const x = rect.x + offsetX;
		const y = rect.y + offsetY;
		const w = this.dyn.width(node, rect.w);
		const h = this.dyn.height(node, rect.h);
		const rotation = this.dyn.rotation(node);

		if (node.type === "view") {
			this.paintView(
				node,
				ctx,
				paintLayer,
				style,
				x,
				y,
				w,
				h,
				rotation,
				alpha,
			);
		} else if (node.type === "image") {
			this.paintImage(
				node,
				ctx,
				paintLayer,
				x,
				y,
				w,
				h,
				rotation,
				alpha,
			);
		} else if (node.type === "text") {
			this.paintText(
				node,
				ctx,
				paintLayer,
				style,
				x,
				y,
				w,
				h,
				rotation,
				alpha,
				font,
			);
		} else if (node.type === "glyphs") {
			this.paintGlyphs(node, ctx, paintLayer, style, x, y, font);
		} else if (node.type === "line") {
			this.paintLine(node, ctx, paintLayer, x, y);
		} else if (node.type === "holdring") {
			this.paintHoldRing(node, ctx, paintLayer, x, y, w, h);
		}

		const clip = isOverflowHidden(style);
		if (clip) {
			ctx.renderer.pushClip(paintLayer, { x, y, w, h });
		}
		for (const child of node.children) {
			this.paint(
				child,
				ctx,
				paintLayer,
				alpha,
				offsetX,
				offsetY,
				font,
			);
		}
		if (clip) {
			ctx.renderer.popClip(paintLayer);
		}
	}

	private paintView(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		style: Style | undefined,
		x: number,
		y: number,
		w: number,
		h: number,
		rotation: number,
		alpha: number,
	): void {
		const background = this.dyn.backgroundColor(node, style);
		if (style?.nineSlice) {
			drawNineSlice(ctx.renderer, layer, style.nineSlice.image, {
				x,
				y,
				width: w,
				height: h,
				insets: style.nineSlice.insets,
				alpha,
				tint: background,
			});
			return;
		}
		if (background !== undefined) {
			ctx.renderer.drawRect(layer, {
				x,
				y,
				width: w,
				height: h,
				rotation,
				fill: background,
				alpha,
			});
		}
	}

	private paintImage(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		x: number,
		y: number,
		w: number,
		h: number,
		rotation: number,
		alpha: number,
	): void {
		const src = node.props.src as TileSource | undefined;
		if (!src) {
			return;
		}
		const tint = this.dyn.color(node, styleOf(node));
		ctx.renderer.drawImage(layer, src, {
			x: x + w / 2,
			y: y + h / 2,
			width: w,
			height: h,
			rotation,
			srcX: node.props.srcX as number | undefined,
			srcY: node.props.srcY as number | undefined,
			srcW: node.props.srcW as number | undefined,
			srcH: node.props.srcH as number | undefined,
			tint,
			alpha,
		});
	}

	private paintText(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		style: Style | undefined,
		x: number,
		y: number,
		w: number,
		h: number,
		rotation: number,
		alpha: number,
		defaultFont: LoadedFont | undefined,
	): void {
		const values = this.dyn.get(node.id);
		const fontSettings = values?.font ?? style?.font;
		const font = fontSettings
			? resolveFont(fontSettings, ctx.assetManager)
			: defaultFont;
		if (!font) {
			return;
		}
		const raw =
			values?.text ?? node.props.text ?? node.props.children;
		if (raw === undefined || raw === null) {
			return;
		}
		const content =
			typeof raw === "string" || typeof raw === "number"
				? String(raw)
				: "";
		const color = this.dyn.color(node, style);
		const centering =
			Boolean(style?.centerInk) && values?.scale === undefined;
		const bounds = centering ? inkBounds(font, content) : null;
		const penX = bounds
			? x + (w - (bounds.maxX - bounds.minX)) / 2 - bounds.minX
			: x;
		let baseline: number;
		if (bounds) {
			baseline =
				y + (h - (bounds.maxY - bounds.minY)) / 2 - bounds.minY;
		} else if (centering) {
			baseline = y + (h - font.lineHeight) / 2 + font.ascent;
		} else {
			baseline = y + font.ascent;
		}
		ctx.renderer.drawText(layer, font, content, penX, baseline, {
			color,
			outline: style?.textOutline,
			rotation,
			alpha,
			align: bounds ? "left" : style?.textAlign,
			scale: values?.scale,
		});
	}

	private paintGlyphs(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		style: Style | undefined,
		x: number,
		y: number,
		defaultFont: LoadedFont | undefined,
	): void {
		const font = style?.font
			? resolveFont(style.font, ctx.assetManager)
			: defaultFont;
		if (!font) {
			return;
		}
		const lines = node.props.glyphs as
			| readonly RichLine[]
			| undefined;
		if (!lines) {
			return;
		}
		const reveal = this.dyn.reveal(node);
		const ex = baselineEx(font);
		const t = ctx.time.elapsed;
		const fallback = style?.color ?? GLYPH_DEFAULT;
		let index = 0;
		for (let line = 0; line < lines.length; line++) {
			const baseY = y + ex + line * font.lineHeight;
			for (const glyph of lines[line]!.glyphs) {
				if (index < reveal) {
					let dx = 0;
					let dy = 0;
					if (glyph.wave) {
						const phase = index * 0.7;
						dx =
							Math.sin(t * glyph.wave.speed + phase) *
							glyph.wave.force;
						dy =
							Math.cos(t * glyph.wave.speed * 1.3 + phase) *
							glyph.wave.force;
					}
					ctx.renderer.drawGlyph(
						layer,
						font,
						glyph.glyphId,
						glyph.style,
						x + glyph.x + dx,
						baseY + dy,
						glyph.color ?? fallback,
					);
				}
				index++;
			}
		}
	}

	private paintHoldRing(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		x: number,
		y: number,
		w: number,
		h: number,
	): void {
		const props = node.props;
		const frame = props.frame as TileSource | undefined;
		const insets = props.insets as NineSliceInsets | undefined;
		if (!frame || !insets) {
			return;
		}
		ctx.renderer.drawHoldRing(layer, {
			x,
			y,
			width: w,
			height: h,
			frame,
			insets,
			progress: this.dyn.progress(node),
			inner: props.inner as ColorInput,
			fill: props.fill as ColorInput,
			outer: props.outer as ColorInput,
		});
	}

	private paintLine(
		node: UiNode,
		ctx: RenderContext,
		layer: number,
		x: number,
		y: number,
	): void {
		const props = node.props;
		const color = props.color as ColorInput | undefined;
		if (color === undefined) {
			return;
		}
		ctx.renderer.drawLine(
			layer,
			x + (props.x1 as number),
			y + (props.y1 as number),
			x + (props.x2 as number),
			y + (props.y2 as number),
			color,
			(props.width as number | undefined) ?? 1,
		);
	}
}
