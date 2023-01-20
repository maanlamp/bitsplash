/** A function that logs a value to the console and returns it.
 *
 * Useful for dropping in-place in some arbitrary expressions to check their value without having to alter code.
 */
export const log = <T>(value: T) => {
	console.log(value);
	return value;
};

/** Returns a Promise that resolves to _nothing_ after _at least_ `ms` milliseconds. */
export const wait = (ms: number) =>
	new Promise<void>(resolve => setTimeout(resolve, ms));

/** Mark any record type as mutable; specifically this means its properties are no longer `readonly`. */
export type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};

/** Uppercase the first codepoint (***not grapheme***) of a string, adhering to the user's locale, and append the rest of the input _unchanged_. */
export const capitalise = (string: string) =>
	String.fromCodePoint(string.normalize().codePointAt(0)!).toLocaleUpperCase() +
	string.slice(1);

/** Generate an _eager_ list of numbers, starting from `0`, going to `n`. */
export const range = (n: number) => [...Array(n).keys()];

/** Choose a random value from some array `xs`. */
export const choose = <T>(xs: ReadonlyArray<T>) => xs[random(xs.length - 1)];

interface Rand {
	/** Generate a random integer between `0` and `max`. */
	(max: number): number;
	/** Generate a random integer between `min` and `max`. */
	(min: number, max: number): number;
}

export const random: Rand = (...args: number[]) =>
	Math.round(Math.random() * args[0]) + (args[1] ?? 0);

/** Given a list of `T`, return a list with unique instances of `T` in that list. */
export const unique = <T>(xs: ReadonlyArray<T>): ReadonlyArray<T> => [
	...new Set(xs),
];

/** Given a type `T` that extends a `Record`, extract all values (nb. not the keys). */
export type ValueOf<T> = T[keyof T];
