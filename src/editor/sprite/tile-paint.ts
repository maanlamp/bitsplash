import { hashCell } from "../../engine/hash";
import { tileUV } from "../../engine/renderer-2d";
import {
	CAP_ROW,
	CAP_SPRITES,
	Cap,
	classifyCap,
	classifyCorner,
	VARIANT_SPRITES,
	Variant,
} from "../../engine/tilemap/autotile";
import type { TileGrid } from "../../engine/tilemap/grid";

export type SourcePixel = Readonly<{ x: number; y: number }>;

const clamp = (value: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, value));

const quadToSource = (
	u: number,
	v: number,
	quarterTurns: number,
	flip: boolean,
): readonly [number, number] => {
	const uv = tileUV(quarterTurns, flip);
	const topU = uv[0]! * (1 - u) + uv[2]! * u;
	const topV = uv[1]! * (1 - u) + uv[3]! * u;
	const botU = uv[6]! * (1 - u) + uv[4]! * u;
	const botV = uv[7]! * (1 - u) + uv[5]! * u;
	return [topU * (1 - v) + botU * v, topV * (1 - v) + botV * v];
};

const tilePixel = (
	col: number,
	row: number,
	quarterTurns: number,
	flip: boolean,
	u: number,
	v: number,
	srcSize: number,
): SourcePixel => {
	const [su, sv] = quadToSource(u, v, quarterTurns, flip);
	return {
		x:
			col * srcSize + clamp(Math.floor(su * srcSize), 0, srcSize - 1),
		y:
			row * srcSize + clamp(Math.floor(sv * srcSize), 0, srcSize - 1),
	};
};

export const resolveSourcePixel = (
	grid: TileGrid,
	rows: number,
	srcSize: number,
	cx: number,
	cy: number,
	u: number,
	v: number,
	alphaAt: (x: number, y: number) => number,
): SourcePixel | null => {
	const tl = grid.hasTile(cx - 1, cy - 1);
	const tr = grid.hasTile(cx, cy - 1);
	const br = grid.hasTile(cx, cy);
	const bl = grid.hasTile(cx - 1, cy);

	if (rows > CAP_ROW) {
		const cap = classifyCap(tl, tr, br, bl);
		if (cap) {
			const flip =
				cap.cap === Cap.STRAIGHT
					? (hashCell(cx, cy, 1) & 1) === 1
					: cap.flip;
			const pixel = tilePixel(
				CAP_SPRITES[cap.cap]!,
				CAP_ROW,
				0,
				flip,
				u,
				v,
				srcSize,
			);
			if (alphaAt(pixel.x, pixel.y) > 0) {
				return pixel;
			}
		}
	}

	const { variant, rot } = classifyCorner(tl, tr, br, bl);
	if (variant === Variant.EMPTY) {
		return null;
	}
	const slot = VARIANT_SPRITES[variant]!;
	return tilePixel(
		slot.col,
		slot.row,
		slot.baseRot + rot,
		false,
		u,
		v,
		srcSize,
	);
};
