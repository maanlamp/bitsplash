import { Mutable } from "lib/utils";

export type Vector2 = readonly [number, number];

export const op =
	(f: (a: number, b: number) => number) =>
	(a: Vector2, b: Vector2): Vector2 =>
		[f(a[0], b[0]), f(a[1], b[1])];

export const add = (a: Vector2, b: Vector2 | number): Vector2 => [
	a[0] + (typeof b === "number" ? b : b[0]),
	a[1] + (typeof b === "number" ? b : b[1]),
];

export const multiply = (a: Vector2, b: Vector2 | number): Vector2 => [
	a[0] * (typeof b === "number" ? b : b[0]),
	a[1] * (typeof b === "number" ? b : b[1]),
];

export const divide = (a: Vector2, b: Vector2 | number): Vector2 => [
	a[0] / (typeof b === "number" ? b : b[0]),
	a[1] / (typeof b === "number" ? b : b[1]),
];

export const dot = (a: Vector2, b: Vector2) => a[0] * b[0] + a[1] * b[1];

export const magnitude = (x: Vector2) => Math.sqrt(x[0] ** 2 + x[1] ** 2);

export const normalise = (x: Vector2): Vector2 => {
	const mag = magnitude(x);
	const v = [x[0], x[1]] as Mutable<Vector2>;
	if (mag > 0) {
		v[0] /= mag;
		v[1] /= mag;
	}
	return v as Vector2;
};

export const clamp = (a: Vector2, b: Vector2 | number): Vector2 => {
	const maxX = typeof b === "number" ? b : b[0];
	const maxY = typeof b === "number" ? b : b[1];
	return [
		a[0] > maxX ? maxX : a[0] < -maxX ? -maxX : a[0],
		a[1] > maxY ? maxY : a[1] < -maxY ? -maxY : a[1],
	];
};
