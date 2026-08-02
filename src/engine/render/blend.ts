export const BlendMode = {
	NORMAL: 0,
	ADDITIVE: 1,
	MULTIPLY: 2,
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

/** Every {@link QuadBlend}, for validators that must accept exactly these. */
export const QUAD_BLENDS = ["normal", "additive"] as const;

/**
 * How a single quad draw combines with what is already in the layer it is
 * drawn into.
 *
 * - `"normal"` — source-over alpha blending; the default for every draw.
 * - `"additive"` — the quad's color is added to the destination while
 *   destination coverage is preserved; for glows, beams, and fire.
 */
export type QuadBlend = (typeof QUAD_BLENDS)[number];

/**
 * Set the GL blend state for a batch of quads drawn into the target a layer
 * resolves into — its own scratch target, or the destination directly when the
 * layer composites trivially.
 *
 * Both modes assume **straight (non-premultiplied) alpha** source textures,
 * which is the invariant every `Renderer2D` texture upload maintains — hence
 * the `SRC_ALPHA` color factor rather than `ONE`. The separate alpha factors
 * accumulate premultiplied coverage, which is what makes `"normal"` here and
 * `NORMAL` in {@link applyCompositeBlend} the same source-over operator, and
 * so associative: drawing a layer straight into the destination gives the same
 * pixels as resolving it offscreen and compositing. `"additive"` is not
 * associative that way, which is why a layer using it keeps its own target.
 *
 * @example
 * applyQuadBlend(gl, "additive");
 * gl.drawArrays(gl.TRIANGLES, batch.start, batch.count);
 */
export const applyQuadBlend = (
	gl: WebGL2RenderingContext,
	mode: QuadBlend,
): void => {
	gl.enable(gl.BLEND);
	if (mode === "additive") {
		gl.blendFuncSeparate(
			gl.SRC_ALPHA,
			gl.ONE,
			gl.ONE,
			gl.ONE_MINUS_SRC_ALPHA,
		);
		return;
	}
	gl.blendFuncSeparate(
		gl.SRC_ALPHA,
		gl.ONE_MINUS_SRC_ALPHA,
		gl.ONE,
		gl.ONE_MINUS_SRC_ALPHA,
	);
};

export const applyCompositeBlend = (
	gl: WebGL2RenderingContext,
	mode: BlendMode,
): void => {
	gl.enable(gl.BLEND);
	switch (mode) {
		case BlendMode.ADDITIVE:
			gl.blendFunc(gl.ONE, gl.ONE);
			break;
		case BlendMode.MULTIPLY:
			gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
			break;
		default:
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			break;
	}
};
