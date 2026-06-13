export const bresenham = (
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	visit: (x: number, y: number) => void,
): void => {
	let x = x0;
	let y = y0;
	const dx = Math.abs(x1 - x);
	const dy = -Math.abs(y1 - y);
	const sx = x < x1 ? 1 : -1;
	const sy = y < y1 ? 1 : -1;
	let err = dx + dy;
	while (true) {
		visit(x, y);
		if (x === x1 && y === y1) {
			break;
		}
		const e2 = 2 * err;
		if (e2 >= dy) {
			err += dy;
			x += sx;
		}
		if (e2 <= dx) {
			err += dx;
			y += sy;
		}
	}
};
