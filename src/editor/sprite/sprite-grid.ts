import { compileProgram } from "../../engine/gl/programs";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/systems/camera-2d";
import type { CheckerRect } from "./sprite-checker";

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
uniform float u_lw;
uniform float u_fade;
out vec4 out_color;
void main() {
  if (u_fade <= 0.001) {
    discard;
  }
  vec2 world = u_origin + vec2(
    gl_FragCoord.x * u_scale.x,
    (u_texH - gl_FragCoord.y) * u_scale.y
  );
  if (u_tile > 0.5) {
    vec2 mt = mod(world, u_tile);
    if (mt.x < u_lw || mt.y < u_lw) {
      out_color = vec4(0.47, 0.7, 1.0, 0.28 * u_fade);
      return;
    }
  }
  vec2 mp = mod(world, 1.0);
  if (mp.x < u_lw || mp.y < u_lw) {
    out_color = vec4(1.0, 1.0, 1.0, 0.08 * u_fade);
    return;
  }
  discard;
}
`;

type Resources = Readonly<{
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	uOrigin: WebGLUniformLocation;
	uScale: WebGLUniformLocation;
	uTexH: WebGLUniformLocation;
	uTile: WebGLUniformLocation;
	uLw: WebGLUniformLocation;
	uFade: WebGLUniformLocation;
}>;

export class SpriteGridSystem implements RenderSystem {
	private resources: Resources | null = null;

	constructor(
		private layer: number,
		private tileSize: number,
		private rect: CheckerRect,
	) {}

	render({ renderer, ecs }: RenderContext): void {
		const zoom = pickActiveCamera2D(ecs)?.zoom ?? 1;
		renderer.withRawLayer(this.layer, (gl, ctx) => {
			const res = this.ensureResources(gl);
			const scaleX = ctx.spanX / ctx.texW;
			const scaleY = ctx.spanY / ctx.texH;
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
			gl.uniform1f(res.uTile, this.tileSize);
			gl.uniform1f(res.uLw, Math.max(scaleX, scaleY));
			const t = Math.max(0, Math.min(1, (zoom - 6) / 12));
			gl.uniform1f(res.uFade, t * t * (3 - 2 * t));
			const sx = ctx.texW / ctx.spanX;
			const sy = ctx.texH / ctx.spanY;
			gl.enable(gl.SCISSOR_TEST);
			gl.scissor(
				Math.round((this.rect.x - ctx.originX) * sx),
				Math.round(
					ctx.texH -
						(this.rect.y + this.rect.height - ctx.originY) * sy,
				),
				Math.round(this.rect.width * sx),
				Math.round(this.rect.height * sy),
			);
			gl.bindVertexArray(res.vao);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			gl.bindVertexArray(null);
			gl.disable(gl.SCISSOR_TEST);
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
			uLw: gl.getUniformLocation(program, "u_lw")!,
			uFade: gl.getUniformLocation(program, "u_fade")!,
		};
		return this.resources;
	}
}
