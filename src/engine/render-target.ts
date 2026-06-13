export class RenderTarget {
	private gl: WebGL2RenderingContext;
	readonly fbo: WebGLFramebuffer;
	readonly tex: WebGLTexture;
	width = 0;
	height = 0;
	spanX = 0;
	spanY = 0;
	originX = 0;
	originY = 0;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.tex = gl.createTexture()!;
		this.fbo = gl.createFramebuffer()!;
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
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
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			this.tex,
			0,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	resize(width: number, height: number): void {
		if (this.width === width && this.height === height) {
			return;
		}
		this.width = width;
		this.height = height;
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.tex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			width,
			height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
	}

	setOrigin(x: number, y: number): void {
		this.originX = x;
		this.originY = y;
	}

	setSpan(x: number, y: number): void {
		this.spanX = x;
		this.spanY = y;
	}

	dispose(): void {
		this.gl.deleteFramebuffer(this.fbo);
		this.gl.deleteTexture(this.tex);
	}
}
