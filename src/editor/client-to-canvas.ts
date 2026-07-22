/**
 * Converts a pointer event's client coordinates into the canvas' backing-store
 * pixel space — the space in which the renderer places its camera viewport
 * (`camera.viewportWidth`/`viewportHeight` equal `canvas.width`/`height`).
 *
 * The canvas backing store is sized to `cssPixels * devicePixelRatio` while it
 * is laid out at its CSS size, so CSS-pixel pointer coordinates must be scaled
 * by `canvas.width / rect.width` before being fed to `camera.screenToWorld`.
 * Scaling by the measured ratio — rather than `devicePixelRatio` directly —
 * stays correct under Electron's `zoomFactor`, which shifts the effective DPR
 * in a machine-dependent way that rounding would otherwise diverge from.
 *
 * The result is not floored: callers convert to world space first and floor the
 * world coordinate, so fractional canvas coordinates must be preserved here.
 *
 * @example
 * const { x, y } = clientToCanvas(canvas, event.clientX, event.clientY);
 * const world = camera.screenToWorld(new Vector2(x, y));
 */
export const clientToCanvas = (
	element: HTMLCanvasElement,
	clientX: number,
	clientY: number,
): { x: number; y: number } => {
	const rect = element.getBoundingClientRect();
	const scaleX = rect.width === 0 ? 0 : element.width / rect.width;
	const scaleY = rect.height === 0 ? 0 : element.height / rect.height;
	return {
		x: (clientX - rect.left) * scaleX,
		y: (clientY - rect.top) * scaleY,
	};
};
