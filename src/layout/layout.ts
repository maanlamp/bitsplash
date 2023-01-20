import { Mutable } from "lib/utils";

/** CSS is a nightmare. You define a couple components and suddenly there are 1000 different levels of margin, padding and gap. How did this happen? Well, you should've used `Layout`!
 *
 * These are the fundamental sizes from which all gaps, padding and other sized values are created. They are programmatically coupled to classes in `layout.scss`.
 */
export enum Size {
	Tiny = ".1rem",
	Small = ".5rem",
	Medium = "1rem",
	Large = "2rem",
	Huge = "4rem",
}
// TODO: Generate all classes and enums from Size.

/** A nominally different version of `Size`, to have type-safe classes for `gap`s. */
export enum Gap {
	Tiny = "gap-tiny",
	Small = "gap-small",
	Medium = "gap-medium",
	Large = "gap-large",
	Huge = "gap-huge",
}

/** A nominally different version of `Size`, to have type-safe classes for `padding`s. */
export enum Padding {
	Tiny = "padding-tiny",
	Small = "padding-small",
	Medium = "padding-medium",
	Large = "padding-large",
	Huge = "padding-huge",
}

/** Helper type that marks any type `T` as possibly falsy. */
export type Falsy<T> = T | null | false | undefined | 0 | 0n | "";

export type Classes = Falsy<string> | Classes[];

/** Helper function that transforms a list of `Falsy` strings into _one_ string to be used in the `className` property. */
export const classes = (classes: Classes) =>
	[classes]
		.flat(Infinity as 1)
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/, " ");

export type Rect<T> = SideRect<T> | AxisRect<T>;

export type SideRect<T> = Readonly<{
	top: T;
	right: T;
	bottom: T;
	left: T;
}>;

export type AxisRect<T> = Partial<SideRect<T>> &
	Readonly<{
		horizontal: T;
		vertical: T;
	}>;

export const isRectLike = <T>(x: any): x is Partial<Rect<T>> =>
	x.top || x.right || x.bottom || x.left;

export const isAxisRect = <T>(rect: any): rect is AxisRect<T> =>
	!!(rect.horizontal || rect.vertical);

export const axisToSide = <T>(rect: AxisRect<T>): SideRect<T> => {
	const sideRect: Partial<Mutable<SideRect<T>>> = { ...rect };

	if (rect.horizontal) {
		sideRect.left ??= rect.horizontal;
		sideRect.right ??= rect.horizontal;
	}

	if (rect.vertical) {
		sideRect.top ??= rect.vertical;
		sideRect.bottom ??= rect.vertical;
	}

	return sideRect as SideRect<T>;
};

export const paddingToString = (padding: Padding | Partial<Rect<Padding>>) =>
	typeof padding === "string"
		? padding
		: Object.entries<any>(
				isAxisRect(padding) ? axisToSide(padding) : padding
		  ).map(([side, padding]) => padding.replace("-", `-${side.toString()}-`));
