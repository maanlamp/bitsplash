export const log = <T>(x: T) => {
	console.log(x);
	return x;
};

export type Point = { x: number; y: number };

export type Size = { width: number; height: number };

export type SideRect<T> = {
	top: T;
	right: T;
	bottom: T;
	left: T;
};

export type AxisRect<T> = {
	vertical: T;
	horizontal: T;
};

export type Rect<T> = SideRect<T> | AxisRect<T>;

export const lendir = (len: number, rad: number) =>
	[len * Math.cos(rad), len * Math.sin(rad)] as const;
