import { hashCell } from "../hash";
import type { StaticBatch } from "../render/renderer-2d";
import type { TileGrid } from "./grid";
import { HALF_TILE_SIZE, TILE_SIZE } from "./tile";

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

export const TILESET_SUFFIX = ".tileset.png";

export const isAutotileTileset = (url: string): boolean =>
	url.toLowerCase().endsWith(TILESET_SUFFIX);

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

export type AutotileSlot = Readonly<{
	col: number;
	row: number;
	rot: number;
	flip: boolean;
}>;

export type CornerSlots = Readonly<{
	cap: AutotileSlot | null;
	fill: AutotileSlot | null;
}>;

export const cornerSlots = (
	grid: TileGrid,
	cx: number,
	cy: number,
	rows: number,
): CornerSlots => {
	const tl = grid.hasTile(cx - 1, cy - 1);
	const tr = grid.hasTile(cx, cy - 1);
	const br = grid.hasTile(cx, cy);
	const bl = grid.hasTile(cx - 1, cy);

	let cap: AutotileSlot | null = null;
	if (rows > CAP_ROW) {
		const selection = classifyCap(tl, tr, br, bl);
		if (selection) {
			const flip =
				selection.cap === Cap.STRAIGHT
					? (hashCell(cx, cy, 1) & 1) === 1
					: selection.flip;
			cap = {
				col: CAP_SPRITES[selection.cap]!,
				row: CAP_ROW,
				rot: 0,
				flip,
			};
		}
	}

	let fill: AutotileSlot | null = null;
	const { variant, rot } = classifyCorner(tl, tr, br, bl);
	if (variant !== Variant.EMPTY) {
		const slot = VARIANT_SPRITES[variant]!;
		fill = {
			col: slot.col,
			row: slot.row,
			rot: slot.baseRot + rot,
			flip: false,
		};
	}

	return { cap, fill };
};

export const bakeAutotile = (
	batch: StaticBatch,
	grid: TileGrid,
	rows: number,
): void => {
	batch.clear();
	const bounds = grid.bounds();
	if (bounds) {
		const { minX, minY, maxX, maxY } = bounds;
		for (let cy = minY; cy <= maxY + 1; cy++) {
			for (let cx = minX; cx <= maxX + 1; cx++) {
				const { fill } = cornerSlots(grid, cx, cy, rows);
				if (!fill) {
					continue;
				}
				batch.tile(
					cx * TILE_SIZE - HALF_TILE_SIZE,
					cy * TILE_SIZE - HALF_TILE_SIZE,
					TILE_SIZE,
					fill.row * SHEET_COLUMNS + fill.col,
					fill.rot,
					fill.flip,
				);
			}
		}

		for (let cy = minY; cy <= maxY + 1; cy++) {
			for (let cx = minX; cx <= maxX + 1; cx++) {
				const { cap } = cornerSlots(grid, cx, cy, rows);
				if (!cap) {
					continue;
				}
				batch.tile(
					cx * TILE_SIZE - HALF_TILE_SIZE,
					cy * TILE_SIZE - HALF_TILE_SIZE,
					TILE_SIZE,
					cap.row * SHEET_COLUMNS + cap.col,
					cap.rot,
					cap.flip,
				);
			}
		}
	}
	batch.commit();
};
