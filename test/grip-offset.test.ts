import { describe, expect, test } from "bun:test";
import { attachmentWorldOffset } from "../src/game/combat/grip-offset";
import { bspriteAttachment } from "../src/engine/sprite/sprite-asset";
import type {
	BspriteManifest,
	BspriteRect,
} from "../src/engine/sprite/bsprite-manifest";

/**
 * Step 19c: the pure canvas-pixel → world-offset conversion the bow-holding
 * system uses to place the bow at the player's grip attachment. Tests the math
 * directly plus its composition with the real engine attachment query
 * ({@link bspriteAttachment}) — the exact pair `bow-system.ts` calls — so the
 * anchor convention, per-axis scale, flipX mirroring and the absent→fallback
 * path are all pinned. On-screen placement is visual and user-validated; this
 * only guards the arithmetic.
 */

const scale = (
	x: number,
	y: number,
): Readonly<{ x: number; y: number }> => ({
	x,
	y,
});

/** A content rect whose center sits exactly on the canvas center (27.5, 27.5). */
const CENTERED: BspriteRect = { x: 19, y: 11, width: 17, height: 33 };

/** A content rect skewed right (center x = 30.5), like the player's `idle` tag. */
const OFF_CENTER: BspriteRect = {
	x: 22,
	y: 15,
	width: 17,
	height: 33,
};

const manifest = (
	attachments: BspriteManifest["attachments"],
): BspriteManifest => ({
	version: 1,
	width: 55,
	height: 55,
	layers: [],
	frames: [{ duration: 100 }, { duration: 100 }],
	cels: [],
	tags: [],
	attachments,
});

describe("attachmentWorldOffset — canvas pixel to world offset", () => {
	test("anchors at the content-rect center, y axis down (not flipped)", () => {
		const off = attachmentWorldOffset(
			{ x: 35, y: 20 },
			CENTERED,
			scale(1, 1),
		);
		expect(off.x).toBeCloseTo(7.5);
		expect(off.y).toBeCloseTo(-7.5);
	});

	test("respects an off-center content rect", () => {
		const off = attachmentWorldOffset(
			{ x: 24, y: 31 },
			OFF_CENTER,
			scale(1, 1),
		);
		expect(off.x).toBeCloseTo(-6.5);
		expect(off.y).toBeCloseTo(-0.5);
	});

	test("scales each axis independently", () => {
		const off = attachmentWorldOffset(
			{ x: 35, y: 20 },
			CENTERED,
			scale(2, 3),
		);
		expect(off.x).toBeCloseTo(15);
		expect(off.y).toBeCloseTo(-22.5);
	});
});

describe("composed with the engine attachment query (as bow-system does)", () => {
	const m = manifest({ grip: { "0": { x: 35, y: 20 } } });

	const resolve = (
		frame: number,
		content: BspriteRect,
		flipX: boolean,
	): Readonly<{ x: number; y: number }> | undefined => {
		const point = bspriteAttachment(m, "grip", frame);
		return point
			? attachmentWorldOffset(point, content, scale(1, 1), flipX)
			: undefined;
	};

	test("flipX negates x and leaves y unchanged (centered content)", () => {
		const upright = resolve(0, CENTERED, false)!;
		const mirrored = resolve(0, CENTERED, true)!;
		expect(mirrored.x).toBeCloseTo(-upright.x);
		expect(mirrored.y).toBeCloseTo(upright.y);
	});

	test("absent frame yields no offset (caller falls back)", () => {
		expect(resolve(1, CENTERED, false)).toBeUndefined();
		expect(resolve(1, CENTERED, true)).toBeUndefined();
	});
});

describe("flip consistency about the content-rect center (the bug fix)", () => {
	// A grip authored on the hand of a right-facing frame, and a content rect
	// skewed right of the canvas center (as the player's `idle` tag is): the
	// content-rect center is 30.5, not the canvas center 27.5.
	const GRIP = { x: 35, y: 20 } as const;

	test("mirrored offset is the exact negation of the upright offset", () => {
		const upright = attachmentWorldOffset(
			GRIP,
			OFF_CENTER,
			scale(1, 1),
			false,
		);
		const mirrored = attachmentWorldOffset(
			GRIP,
			OFF_CENTER,
			scale(1, 1),
			true,
		);
		// The drawn content rect mirrors about its own center, so the grip must
		// land at the exact mirror-image position when facing left.
		expect(mirrored.x).toBeCloseTo(-upright.x);
		expect(mirrored.y).toBeCloseTo(upright.y);
	});

	test("REGRESSION: the old canvas-center mirror was off by width - 2·centerX", () => {
		// Old behavior: the query mirrored x to `width - x`, then the offset was
		// measured from the content-rect center — a mirror about the CANVAS
		// center, not the content-rect center.
		const centerX = OFF_CENTER.x + OFF_CENTER.width / 2; // 30.5
		const oldMirroredX = 55 - GRIP.x - centerX;
		const correct = attachmentWorldOffset(
			GRIP,
			OFF_CENTER,
			scale(1, 1),
			true,
		);
		const bias = 55 - 2 * centerX; // width - 2·centerX = -6
		expect(oldMirroredX).toBeCloseTo(correct.x + bias);
		// ...and the bias is non-zero precisely because the content rect is not
		// canvas-centered, so the old and new results genuinely differ.
		expect(bias).not.toBeCloseTo(0);
		expect(oldMirroredX).not.toBeCloseTo(correct.x);
	});
});
