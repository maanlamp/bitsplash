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
