export const BlendMode = {
	NORMAL: 0,
	ADDITIVE: 1,
	MULTIPLY: 2,
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

export const applyLayerBlend = (gl: WebGL2RenderingContext): void => {
	gl.enable(gl.BLEND);
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
