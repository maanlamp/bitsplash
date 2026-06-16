declare const durationBrand: unique symbol;

export type Milliseconds = number & {
	readonly [durationBrand]: "ms";
};
export type Seconds = number & { readonly [durationBrand]: "s" };
