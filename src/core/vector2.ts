export type Vector2 = [number, number];

export const deg2rad = (deg: number) => deg * (Math.PI / 180);

export const rad2deg = (rad: number) => rad * (180 / Math.PI);

export const lenDir = (len: number, dir: number): Vector2 => [
	Math.cos(deg2rad(dir)) * len,
	Math.sin(deg2rad(dir)) * len,
];

export const magnitude = (x: number, y: number) => Math.sqrt(x * x + y * y);

export const angle = (x: number, y: number) => Math.atan2(y, x);
