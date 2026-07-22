import type { BlendId } from "../../engine/sprite/bsprite-manifest";
import {
	type LegacyBlendId,
	isLegacyBlend,
	legacyBlendChannel,
} from "./legacy-blend";
import { type PixelBuffer, blankPixels } from "./pixel-buffer";

/**
 * One layer's contribution to a frame bake: its straight-alpha pixels plus the
 * paint state the compositor needs. Ordered bottom→top by the caller.
 */
export type LayerInput = Readonly<{
	visible: boolean;
	/** 0..1 straight opacity scalar applied to the whole layer. */
	opacity: number;
	blend: BlendId;
	/** Canvas-sized straight-alpha RGBA pixels. */
	pixels: PixelBuffer;
}>;

/**
 * Composites a source layer over a backdrop using a canvas2d
 * {@link GlobalCompositeOperation}. Supplied by the browser/editor shell
 * (see `canvas-native-blend.ts`); omitted in headless tests, which only
 * exercise the pure `source-over` and legacy paths.
 */
export type NativeBlendCompositor = (
	backdrop: PixelBuffer,
	source: PixelBuffer,
	opacity: number,
	blend: GlobalCompositeOperation,
) => PixelBuffer;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Composite `source` over `backdrop` (both straight-alpha) with per-layer
 * `opacity`. When `legacy` is given, each RGB channel is first run through the
 * legacy blend formula against the backdrop; otherwise this is plain
 * `source-over`. Alpha compositing is always source-over (W3C compositing),
 * so a legacy layer's coverage matches a normal layer's.
 */
const compositeStraight = (
	backdrop: PixelBuffer,
	source: PixelBuffer,
	opacity: number,
	legacy: LegacyBlendId | null,
): PixelBuffer => {
	const { width, height } = backdrop;
	const out = blankPixels(width, height);
	const bd = backdrop.data;
	const sd = source.data;
	const od = out.data;
	for (let i = 0; i < od.length; i += 4) {
		const ba = bd[i + 3]! / 255;
		const sa = (sd[i + 3]! / 255) * opacity;
		const ao = sa + ba * (1 - sa);
		if (ao <= 0) {
			continue;
		}
		for (let c = 0; c < 3; c++) {
			const b = bd[i + c]! / 255;
			const s = sd[i + c]! / 255;
			const blended = legacy ? legacyBlendChannel(legacy, b, s) : s;
			const cs = (1 - ba) * s + ba * clamp01(blended);
			const co = (cs * sa + b * ba * (1 - sa)) / ao;
			od[i + c] = Math.round(clamp01(co) * 255);
		}
		od[i + 3] = Math.round(ao * 255);
	}
	return out;
};

/**
 * Bake a frame: composite an ordered (bottom→top) layer stack into one
 * straight-alpha {@link PixelBuffer}. `source-over` and the five legacy modes
 * are evaluated by a pure integer per-channel loop; every other native mode is
 * delegated to `nativeBlend` (canvas2d `globalCompositeOperation`). The same
 * function backs both the save-time bake and the live preview, so they agree
 * by construction.
 *
 * @throws if a layer needs a native (non-`source-over`) blend but no
 * `nativeBlend` compositor was supplied (e.g. a headless caller).
 */
export const compositeFrame = (
	width: number,
	height: number,
	layers: readonly LayerInput[],
	nativeBlend?: NativeBlendCompositor,
): PixelBuffer => {
	let backdrop = blankPixels(width, height);
	for (const layer of layers) {
		if (!layer.visible || layer.opacity <= 0) {
			continue;
		}
		if (layer.blend === "source-over") {
			backdrop = compositeStraight(
				backdrop,
				layer.pixels,
				layer.opacity,
				null,
			);
		} else if (isLegacyBlend(layer.blend)) {
			backdrop = compositeStraight(
				backdrop,
				layer.pixels,
				layer.opacity,
				layer.blend,
			);
		} else {
			if (!nativeBlend) {
				throw new Error(
					`Native blend "${layer.blend}" requires a canvas compositor`,
				);
			}
			backdrop = nativeBlend(
				backdrop,
				layer.pixels,
				layer.opacity,
				layer.blend,
			);
		}
	}
	return backdrop;
};
