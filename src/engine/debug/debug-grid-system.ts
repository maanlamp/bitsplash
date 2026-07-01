import { compileProgram } from "../render/programs";
import { type RenderContext, RenderSystem } from "../system";
import { pickActiveCamera2D } from "../camera/camera-2d-render";
import { HALF_TILE_SIZE, TILE_SIZE } from "../tilemap/tile";

const VS = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision mediump float;
uniform vec2 u_origin;
uniform vec2 u_scale;
uniform float u_texH;
uniform float u_tile;
uniform float u_half;
uniform float u_lw;
out vec4 out_color;
void main() {
  vec2 world = u_origin + vec2(
    gl_FragCoord.x * u_scale.x,
    (u_texH - gl_FragCoord.y) * u_scale.y
  );
  if (abs(world.x) < u_lw) {
    out_color = vec4(0.45, 0.85, 0.45, 0.25);
    return;
  }
  if (abs(world.y) < u_lw) {
    out_color = vec4(0.9, 0.45, 0.45, 0.25);
    return;
  }
  vec2 m = mod(world, u_tile);
  bool edge = m.x < u_lw || m.y < u_lw;
  bool mid =
    (m.x >= u_half && m.x < u_half + u_lw) ||
    (m.y >= u_half && m.y < u_half + u_lw);
  float a = edge ? 0.1 : (mid ? 0.05 : 0.0);
  if (a == 0.0) {
    discard;
  }
  out_color = vec4(1.0, 1.0, 1.0, a);
}
`;

type Resources = Readonly<{
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	uOrigin: WebGLUniformLocation;
	uScale: WebGLUniformLocation;
	uTexH: WebGLUniformLocation;
	uTile: WebGLUniformLocation;
	uHalf: WebGLUniformLocation;
	uLw: WebGLUniformLocation;
}>;

export class DebugGridSystem implements RenderSystem {
	private layer: number;
	private resources: Resources | null = null;

	constructor(layer: number) {
		this.layer = layer;
	}

	render({ renderer, ecs }: RenderContext): void {
		const zoom = pickActiveCamera2D(ecs)?.zoom ?? 1;
		renderer.withRawLayer(this.layer, (gl, ctx) => {
			const res = this.ensureResources(gl);
			const scaleX = ctx.spanX / ctx.texW;
			const scaleY = ctx.spanY / ctx.texH;
			const lineWidth = Math.max(1 / zoom, Math.max(scaleX, scaleY));
			gl.useProgram(res.program);
			gl.enable(gl.BLEND);
			gl.blendFuncSeparate(
				gl.SRC_ALPHA,
				gl.ONE_MINUS_SRC_ALPHA,
				gl.ONE,
				gl.ONE_MINUS_SRC_ALPHA,
			);
			gl.uniform2f(res.uOrigin, ctx.originX, ctx.originY);
			gl.uniform2f(res.uScale, scaleX, scaleY);
			gl.uniform1f(res.uTexH, ctx.texH);
			gl.uniform1f(res.uTile, TILE_SIZE);
			gl.uniform1f(res.uHalf, HALF_TILE_SIZE);
			gl.uniform1f(res.uLw, lineWidth);
			gl.bindVertexArray(res.vao);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindVertexArray(null);
		});
	}

	private ensureResources(gl: WebGL2RenderingContext): Resources {
		if (this.resources) {
			return this.resources;
		}
		const program = compileProgram(gl, VS, FS);
		const vao = gl.createVertexArray()!;
		gl.bindVertexArray(vao);
		const vbo = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
			gl.STATIC_DRAW,
		);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);
		this.resources = {
			program,
			vao,
			uOrigin: gl.getUniformLocation(program, "u_origin")!,
			uScale: gl.getUniformLocation(program, "u_scale")!,
			uTexH: gl.getUniformLocation(program, "u_texH")!,
			uTile: gl.getUniformLocation(program, "u_tile")!,
			uHalf: gl.getUniformLocation(program, "u_half")!,
			uLw: gl.getUniformLocation(program, "u_lw")!,
		};
		return this.resources;
	}
}
