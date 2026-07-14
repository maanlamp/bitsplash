declare const KNOT_BRAND: unique symbol;

export type Knot = string & { readonly [KNOT_BRAND]: true };

export const asKnot = (path: string): Knot => path as Knot;
