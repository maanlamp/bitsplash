export const Variant = {
	EMPTY: 0,
	CORNER: 1,
	EDGE: 2,
	DIAGONAL: 3,
	INV_CORNER: 4,
	FULL: 5,
} as const;

export type TileSelection = Readonly<{
	variant: number;
	rot: number;
}>;

export const classifyCorner = (
	tl: boolean,
	tr: boolean,
	br: boolean,
	bl: boolean,
): TileSelection => {
	const cw = [tl, tr, br, bl];
	const count = cw.filter(Boolean).length;

	if (count === 0) {
		return { variant: Variant.EMPTY, rot: 0 };
	}
	if (count === 4) {
		return { variant: Variant.FULL, rot: 0 };
	}
	if (count === 1) {
		return { variant: Variant.CORNER, rot: cw.indexOf(true) };
	}
	if (count === 3) {
		return { variant: Variant.INV_CORNER, rot: cw.indexOf(false) };
	}
	if (tl && br) {
		return { variant: Variant.DIAGONAL, rot: 0 };
	}
	if (tr && bl) {
		return { variant: Variant.DIAGONAL, rot: 1 };
	}
	const start = cw.findIndex((v, i) => v && cw[(i + 1) % 4]);
	return { variant: Variant.EDGE, rot: start };
};

export const Cap = {
	STRAIGHT: 0,
	OUTER: 1,
	INNER: 2,
} as const;

export type CapSelection = Readonly<{
	cap: number;
	flip: boolean;
}>;

export const classifyCap = (
	tl: boolean,
	tr: boolean,
	br: boolean,
	bl: boolean,
): CapSelection | null => {
	const left = bl && !tl;
	const right = br && !tr;
	if (!left && !right) {
		return null;
	}
	if (left && right) {
		return { cap: Cap.STRAIGHT, flip: false };
	}
	if (left) {
		return { cap: br ? Cap.INNER : Cap.OUTER, flip: false };
	}
	return { cap: bl ? Cap.INNER : Cap.OUTER, flip: true };
};

export const SHEET_COLUMNS = 3;

export const CAP_ROW = 2;

export const CAP_SPRITES: Readonly<Record<number, number>> = {
	[Cap.STRAIGHT]: 0,
	[Cap.OUTER]: 1,
	[Cap.INNER]: 2,
};

type SpriteSlot = Readonly<{
	col: number;
	row: number;
	baseRot: number;
}>;

export const VARIANT_SPRITES: Readonly<Record<number, SpriteSlot>> = {
	[Variant.EMPTY]: { col: 0, row: 0, baseRot: 0 },
	[Variant.CORNER]: { col: 1, row: 0, baseRot: 2 },
	[Variant.EDGE]: { col: 2, row: 0, baseRot: 3 },
	[Variant.DIAGONAL]: { col: 0, row: 1, baseRot: 0 },
	[Variant.INV_CORNER]: { col: 1, row: 1, baseRot: 1 },
	[Variant.FULL]: { col: 2, row: 1, baseRot: 0 },
};
