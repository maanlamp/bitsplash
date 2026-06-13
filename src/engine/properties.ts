/**
 * Explicit property-only copy of an object.
 *
 * In practise, this is used to strip class prototype so oxc stops complaining.
 */
export type Properties<T extends object> = {
	[K in keyof T]: T[K];
};
