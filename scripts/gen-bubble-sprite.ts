import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Zippable, strToU8, zipSync } from "fflate";
import { encodePng } from "../src/editor/sprite/png-codec";
import {
	type PixelBuffer,
	blankPixels,
} from "../src/editor/sprite/pixel-buffer";
import type { NineSliceInsets } from "../src/engine/render/nine-slice";
import type { BspriteManifest } from "../src/engine/sprite/bsprite-manifest";

const OUT_FILE = fileURLToPath(
	new URL(
		"../src/game/content/assets/bubble.bsprite",
		import.meta.url,
	),
);

const SIZE = 16;
const RADIUS = 4;
const LAYER_ID = "frame";
const FRAME_DURATION = 100;

const FILL: readonly [number, number, number, number] = [
	0, 0, 0, 255,
];
const BORDER: readonly [number, number, number, number] = [
	255, 255, 255, 255,
];

/**
 * 9-slice insets. The rounded corners shape only the outer three pixels, so a
 * four-pixel inset keeps a full pixel of straight edge inside each corner band
 * and leaves `SIZE - left - right - 1 = 7` pixels of stretchable middle.
 */
const SLICE: NineSliceInsets = {
	left: 4,
	right: 4,
	top: 4,
	bottom: 4,
	gap: 0,
};

/**
 * A fixed local wall-clock instant for every zip entry. `zipSync` otherwise
 * stamps `Date.now()`, which would make the committed archive differ on every
 * run; a `Date` built from local components (rather than an epoch offset) also
 * keeps the DOS date fields identical across time zones.
 */
const MTIME = new Date(1980, 0, 2, 12, 0, 0);

const insideRoundRect = (
	px: number,
	py: number,
	size: number,
	radius: number,
): boolean => {
	if (px < 0 || py < 0 || px > size || py > size) {
		return false;
	}
	const cx = Math.min(Math.max(px, radius), size - radius);
	const cy = Math.min(Math.max(py, radius), size - radius);
	const dx = px - cx;
	const dy = py - cy;
	return dx * dx + dy * dy <= radius * radius;
};

const roundRectMask = (): boolean[] => {
	const mask: boolean[] = [];
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			mask.push(insideRoundRect(x + 0.5, y + 0.5, SIZE, RADIUS));
		}
	}
	return mask;
};

/**
 * Shrink a mask by one pixel in the eight-neighbour sense: a pixel survives only
 * when it and all eight of its neighbours are set. Using eight-connectivity
 * rather than four means the border never leaves a fill pixel diagonally
 * touching transparency at the corners.
 */
const erode = (mask: readonly boolean[]): boolean[] => {
	const at = (x: number, y: number): boolean =>
		x >= 0 && y >= 0 && x < SIZE && y < SIZE
			? mask[y * SIZE + x]
			: false;
	const out: boolean[] = [];
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			let survives = true;
			for (let dy = -1; dy <= 1 && survives; dy++) {
				for (let dx = -1; dx <= 1 && survives; dx++) {
					survives = at(x + dx, y + dy);
				}
			}
			out.push(survives);
		}
	}
	return out;
};

/**
 * The bubble frame: a pixelated rounded rectangle with a one-pixel white border
 * around a black fill, transparent outside.
 */
const bubbleFrame = (): PixelBuffer => {
	const outer = roundRectMask();
	const inner = erode(outer);
	const image = blankPixels(SIZE, SIZE);
	for (let p = 0; p < SIZE * SIZE; p++) {
		if (!outer[p]) {
			continue;
		}
		const color = inner[p] ? FILL : BORDER;
		image.data.set(color, p * 4);
	}
	return image;
};

const FRAMES: readonly PixelBuffer[] = [bubbleFrame()];

if (FRAMES.length !== 1) {
	throw new Error(
		`bubble.bsprite must stay single-frame (got ${FRAMES.length}). drawNineSlice measures the insets against the whole composed sheet, whose width is frames × ${SIZE}, so a second frame silently misplaces every slice band.`,
	);
}

const manifest: BspriteManifest = {
	version: 1,
	width: SIZE,
	height: SIZE,
	layers: [
		{
			id: LAYER_ID,
			name: "Frame",
			opacity: 1,
			visible: true,
			blend: "source-over",
		},
	],
	frames: FRAMES.map(() => ({ duration: FRAME_DURATION })),
	cels: FRAMES.map((_, frame) => ({ layer: LAYER_ID, frame })),
	tags: [],
	slice: SLICE,
};

const entries: Zippable = {
	"manifest.json": [
		strToU8(JSON.stringify(manifest)),
		{ level: 6, mtime: MTIME },
	],
};
for (let frame = 0; frame < FRAMES.length; frame++) {
	const png = encodePng(FRAMES[frame]);
	const stored: Zippable[string] = [png, { level: 0, mtime: MTIME }];
	entries[`layers/${LAYER_ID}/${frame}.png`] = stored;
	entries[`bakes/${frame}.png`] = stored;
}

const bytes = zipSync(entries, { level: 6, mtime: MTIME });

const unchanged = (): boolean => {
	try {
		return Buffer.from(readFileSync(OUT_FILE)).equals(
			Buffer.from(bytes),
		);
	} catch {
		return false;
	}
};

if (unchanged()) {
	console.log(`Unchanged ${OUT_FILE}`);
} else {
	writeFileSync(OUT_FILE, bytes);
	console.log(`Generated ${OUT_FILE}`);
}
console.log(
	`  ${SIZE}x${SIZE}, ${FRAMES.length} frame, slice ${JSON.stringify(SLICE)}`,
);
