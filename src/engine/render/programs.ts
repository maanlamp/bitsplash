const WORLD_VS = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_color;
uniform vec2 u_resolution;
uniform vec2 u_origin;
out vec2 v_uv;
out vec4 v_color;
void main() {
  vec2 pos = a_position - u_origin;
  vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const QUAD_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
in vec4 v_color;
out vec4 out_color;
void main() {
  out_color = texture(u_tex, v_uv) * v_color;
}
`;

const TEXT_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
in vec4 v_color;
out vec4 out_color;
void main() {
  float a = texture(u_tex, v_uv).r;
  out_color = vec4(v_color.rgb, v_color.a * a);
}
`;

const QUAD_OUTLINE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
in vec2 v_uv;
in vec4 v_color;
out vec4 out_color;
float alphaAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  return texture(u_tex, uv).a;
}
void main() {
  if (alphaAt(v_uv) > 0.5) {
    discard;
  }
  float tx = u_texel.x;
  float ty = u_texel.y;
  float m = 0.0;
  m = max(m, alphaAt(v_uv + vec2(-tx, 0.0)));
  m = max(m, alphaAt(v_uv + vec2(tx, 0.0)));
  m = max(m, alphaAt(v_uv + vec2(0.0, -ty)));
  m = max(m, alphaAt(v_uv + vec2(0.0, ty)));
  m = max(m, alphaAt(v_uv + vec2(-tx, -ty)));
  m = max(m, alphaAt(v_uv + vec2(tx, -ty)));
  m = max(m, alphaAt(v_uv + vec2(-tx, ty)));
  m = max(m, alphaAt(v_uv + vec2(tx, ty)));
  if (m > 0.5) {
    out_color = v_color;
  } else {
    discard;
  }
}
`;

const QUAD_CONIC_OUTLINE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_progress;
uniform vec4 u_inner;
uniform vec4 u_fill;
uniform vec4 u_outer;
in vec2 v_uv;
in vec4 v_color;
out vec4 out_color;
const float TWO_PI = 6.2831853;
float alphaAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  return texture(u_tex, uv).a;
}
float ringAt(vec2 uv, float scale) {
  float tx = u_texel.x * scale;
  float ty = u_texel.y * scale;
  float m = 0.0;
  m = max(m, alphaAt(uv + vec2(-tx, 0.0)));
  m = max(m, alphaAt(uv + vec2(tx, 0.0)));
  m = max(m, alphaAt(uv + vec2(0.0, -ty)));
  m = max(m, alphaAt(uv + vec2(0.0, ty)));
  m = max(m, alphaAt(uv + vec2(-tx, -ty)));
  m = max(m, alphaAt(uv + vec2(tx, -ty)));
  m = max(m, alphaAt(uv + vec2(-tx, ty)));
  m = max(m, alphaAt(uv + vec2(tx, ty)));
  return m;
}
void main() {
  if (alphaAt(v_uv) > 0.5) {
    discard;
  }
  if (ringAt(v_uv, 1.0) > 0.5) {
    float t = atan(v_uv.x - 0.5, v_uv.y - 0.5) / TWO_PI;
    if (t < 0.0) {
      t += 1.0;
    }
    out_color = t <= u_progress ? u_fill : u_inner;
    return;
  }
  if (ringAt(v_uv, 2.0) > 0.5) {
    out_color = u_outer;
    return;
  }
  discard;
}
`;

const QUAD_SWAY_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec4 u_rect;
uniform vec2 u_srcSize;
uniform float u_amplitude;
uniform float u_curve;
uniform float u_rustle;
uniform float u_rustleFrequency;
uniform float u_phase;
uniform float u_time;
uniform float u_pinnedBase;
uniform float u_flipX;
in vec2 v_uv;
in vec4 v_color;
out vec4 out_color;
const float TWO_PI = 6.2831853;
const float LEAF_CONCENTRATION = 3.0;
void main() {
  vec2 span = u_rect.zw - u_rect.xy;
  vec2 local = (v_uv - u_rect.xy) / span;
  float row = (floor(local.y * u_srcSize.y) + 0.5) / u_srcSize.y;
  float h = clamp(mix(row, 1.0 - row, u_pinnedBase), 0.0, 1.0);
  float flutter = sin(TWO_PI * (u_rustleFrequency * (u_time + u_phase) + h));
  float leaves = pow(h, u_curve * LEAF_CONCENTRATION);
  float bend = pow(h, u_curve) * u_amplitude + leaves * u_rustle * flutter;
  bend = floor(bend * u_srcSize.x + 0.5) / u_srcSize.x;
  vec2 src = vec2(local.x - bend, local.y);
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    discard;
  }
  src.x = mix(src.x, 1.0 - src.x, u_flipX);
  out_color = texture(u_tex, u_rect.xy + src * span) * v_color;
}
`;

const TILE_VS = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_layer;
layout(location=3) in vec4 a_color;
uniform vec2 u_resolution;
uniform vec2 u_origin;
out vec2 v_uv;
out float v_layer;
out vec4 v_color;
void main() {
  vec2 pos = a_position - u_origin;
  vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_layer = a_layer;
  v_color = a_color;
}
`;

const TILE_FS = `#version 300 es
precision mediump float;
uniform mediump sampler2DArray u_array;
in vec2 v_uv;
in float v_layer;
in vec4 v_color;
out vec4 out_color;
void main() {
  out_color = texture(u_array, vec3(v_uv, v_layer)) * v_color;
}
`;

const BLIT_VS = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const BLIT_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
in vec2 v_uv;
out vec4 out_color;
void main() {
  out_color = texture(u_tex, v_uv) * u_opacity;
}
`;

const compileShader = (
	gl: WebGL2RenderingContext,
	type: number,
	src: string,
): WebGLShader => {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error(
			gl.getShaderInfoLog(shader) ?? "Shader compile error",
		);
	}
	return shader;
};

const link = (
	gl: WebGL2RenderingContext,
	vsSrc: string,
	fsSrc: string,
): WebGLProgram => {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
	const program = gl.createProgram()!;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(
			gl.getProgramInfoLog(program) ?? "Program link error",
		);
	}
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	return program;
};

export const compileProgram = (
	gl: WebGL2RenderingContext,
	vsSrc: string,
	fsSrc: string,
): WebGLProgram => link(gl, vsSrc, fsSrc);

export type WorldProgram = Readonly<{
	program: WebGLProgram;
	uResolution: WebGLUniformLocation;
	uOrigin: WebGLUniformLocation;
	uSampler: WebGLUniformLocation;
}>;

export type BlitProgram = Readonly<{
	program: WebGLProgram;
	uTex: WebGLUniformLocation;
	uOpacity: WebGLUniformLocation;
}>;

export type OutlineProgram = WorldProgram &
	Readonly<{ uTexel: WebGLUniformLocation }>;

export type ConicOutlineProgram = WorldProgram &
	Readonly<{
		uTexel: WebGLUniformLocation;
		uProgress: WebGLUniformLocation;
		uInner: WebGLUniformLocation;
		uFill: WebGLUniformLocation;
		uOuter: WebGLUniformLocation;
	}>;

/**
 * The bend program's uniforms. Every one is a per-draw value, so a sway quad
 * goes through the immediate path rather than a batch — the same trade the
 * conic outline makes.
 *
 * `uRect` is the sprite's sub-rect in texture space (`u0, v0, u1, v1`) in
 * canonical, unflipped order; the fragment stage derives its sprite-local
 * coordinates from it and mirrors through `uFlipX`, so a flipped sprite still
 * leans downwind. `uAmplitude` and `uRustle` are fractions of the sprite's
 * **drawn width**, signed, measured at the free edge.
 */
export type SwayProgram = WorldProgram &
	Readonly<{
		uRect: WebGLUniformLocation;
		uSrcSize: WebGLUniformLocation;
		uAmplitude: WebGLUniformLocation;
		uCurve: WebGLUniformLocation;
		uRustle: WebGLUniformLocation;
		uRustleFrequency: WebGLUniformLocation;
		uPhase: WebGLUniformLocation;
		uTime: WebGLUniformLocation;
		uPinnedBase: WebGLUniformLocation;
		uFlipX: WebGLUniformLocation;
	}>;

const worldProgram = (
	gl: WebGL2RenderingContext,
	fs: string,
	samplerName: string,
): WorldProgram => {
	const program = link(gl, WORLD_VS, fs);
	return {
		program,
		uResolution: gl.getUniformLocation(program, "u_resolution")!,
		uOrigin: gl.getUniformLocation(program, "u_origin")!,
		uSampler: gl.getUniformLocation(program, samplerName)!,
	};
};

export const createQuadProgram = (
	gl: WebGL2RenderingContext,
): WorldProgram => worldProgram(gl, QUAD_FS, "u_tex");

export const createTextProgram = (
	gl: WebGL2RenderingContext,
): WorldProgram => worldProgram(gl, TEXT_FS, "u_tex");

export const createQuadOutlineProgram = (
	gl: WebGL2RenderingContext,
): OutlineProgram => {
	const base = worldProgram(gl, QUAD_OUTLINE_FS, "u_tex");
	return {
		...base,
		uTexel: gl.getUniformLocation(base.program, "u_texel")!,
	};
};

export const createQuadConicOutlineProgram = (
	gl: WebGL2RenderingContext,
): ConicOutlineProgram => {
	const base = worldProgram(gl, QUAD_CONIC_OUTLINE_FS, "u_tex");
	return {
		...base,
		uTexel: gl.getUniformLocation(base.program, "u_texel")!,
		uProgress: gl.getUniformLocation(base.program, "u_progress")!,
		uInner: gl.getUniformLocation(base.program, "u_inner")!,
		uFill: gl.getUniformLocation(base.program, "u_fill")!,
		uOuter: gl.getUniformLocation(base.program, "u_outer")!,
	};
};

/**
 * The foliage bend program: {@link SwayProgram}.
 *
 * A quad has four corners, so a vertex-stage bend is linear by construction and
 * cannot be "less low, more high". This displaces in the **fragment** stage
 * instead — each output texel inverts the bend to find the source texel it came
 * from — so the profile is a free function of height rather than a shear.
 */
export const createQuadSwayProgram = (
	gl: WebGL2RenderingContext,
): SwayProgram => {
	const base = worldProgram(gl, QUAD_SWAY_FS, "u_tex");
	const at = (name: string): WebGLUniformLocation =>
		gl.getUniformLocation(base.program, name)!;
	return {
		...base,
		uRect: at("u_rect"),
		uSrcSize: at("u_srcSize"),
		uAmplitude: at("u_amplitude"),
		uCurve: at("u_curve"),
		uRustle: at("u_rustle"),
		uRustleFrequency: at("u_rustleFrequency"),
		uPhase: at("u_phase"),
		uTime: at("u_time"),
		uPinnedBase: at("u_pinnedBase"),
		uFlipX: at("u_flipX"),
	};
};

export const createTileProgram = (
	gl: WebGL2RenderingContext,
): WorldProgram => {
	const program = link(gl, TILE_VS, TILE_FS);
	return {
		program,
		uResolution: gl.getUniformLocation(program, "u_resolution")!,
		uOrigin: gl.getUniformLocation(program, "u_origin")!,
		uSampler: gl.getUniformLocation(program, "u_array")!,
	};
};

export const createBlitProgram = (
	gl: WebGL2RenderingContext,
): BlitProgram => {
	const program = link(gl, BLIT_VS, BLIT_FS);
	return {
		program,
		uTex: gl.getUniformLocation(program, "u_tex")!,
		uOpacity: gl.getUniformLocation(program, "u_opacity")!,
	};
};
