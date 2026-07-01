import { compileProgram } from "../../engine/render/programs";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";

const VS = `#version 300 es
precision mediump float;
layout(location=0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision mediump float;
uniform float u_cell;
uniform int u_mode;
uniform vec3 u_plain;
out vec4 out_color;
void main() {
  if (u_mode == 0) {
    out_color = vec4(u_plain, 1.0);
    return;
  }
  vec2 c = floor(gl_FragCoord.xy / u_cell);
  float v = mod(c.x + c.y, 2.0);
  vec3 col = v < 0.5 ? vec3(0.16) : vec3(0.22);
  out_color = vec4(col, 1.0);
}
`;

type Resources = Readonly<{
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	uCell: WebGLUniformLocation;
	uMode: WebGLUniformLocation;
	uPlain: WebGLUniformLocation;
}>;

export type CheckerRect = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export class SpriteCheckerSystem implements RenderSystem {
	private resources: Resources | null = null;

	constructor(
		private layer: number,
		private rect: CheckerRect,
		private cell = 8,
	) {}

	render({ renderer }: RenderContext): void {
		renderer.withRawLayer(this.layer, (gl, ctx) => {
			const res = this.ensureResources(gl);
			gl.useProgram(res.program);
			gl.disable(gl.BLEND);
			gl.bindVertexArray(res.vao);

			gl.disable(gl.SCISSOR_TEST);
			gl.uniform1i(res.uMode, 0);
			gl.uniform3f(res.uPlain, 0.1, 0.1, 0.1);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			const sx = ctx.texW / ctx.spanX;
			const sy = ctx.texH / ctx.spanY;
			const x = Math.round((this.rect.x - ctx.originX) * sx);
			const y = Math.round(
				ctx.texH -
					(this.rect.y + this.rect.height - ctx.originY) * sy,
			);
			const w = Math.round(this.rect.width * sx);
			const h = Math.round(this.rect.height * sy);
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(x, y, w, h);
			gl.uniform1i(res.uMode, 1);
			gl.uniform1f(res.uCell, this.cell);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.disable(gl.SCISSOR_TEST);

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
			uCell: gl.getUniformLocation(program, "u_cell")!,
			uMode: gl.getUniformLocation(program, "u_mode")!,
			uPlain: gl.getUniformLocation(program, "u_plain")!,
		};
		return this.resources;
	}
}
