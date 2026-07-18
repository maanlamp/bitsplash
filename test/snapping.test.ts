import { describe, expect, test } from "bun:test";
import type { EntityAabb } from "../src/editor/pick";
import { snap, type SnapContext } from "../src/editor/snapping";

const ctx = (over: Partial<SnapContext> = {}): SnapContext => ({
	enabled: true,
	grid: 32,
	threshold: 8,
	neighbors: [],
	...over,
});

const box = (
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
): EntityAabb => ({ minX, minY, maxX, maxY });

describe("snap resolver", () => {
	test("is the identity when disabled (Ctrl-escape)", () => {
		const result = snap(
			box(30, 30, 62, 62),
			{ x: 30, y: 30 },
			ctx({ enabled: false }),
		);
		expect(result).toEqual({ x: 30, y: 30, guides: [] });
	});

	test("a geometry-less entity degrades to snapping the pivot to grid", () => {
		const result = snap(null, { x: 20, y: 44 }, ctx());
		expect(result.x).toBe(32);
		expect(result.y).toBe(32);
		expect(result.guides).toHaveLength(0);
	});

	test("snaps the nearest salient point of the bounds to the grid", () => {
		// A 32-wide box whose min/max corners sit 2 units off a grid line; the
		// centre is 14 off. The resolver must move the +2 corner, not the centre.
		const result = snap(box(30, 30, 62, 62), { x: 30, y: 30 }, ctx());
		expect(result.x).toBe(32);
		expect(result.y).toBe(32);
		expect(result.guides).toHaveLength(0);
	});

	test("smart-guides a neighbour edge and beats the grid when closer", () => {
		// Moving min corner at x=111 is 15 off the nearest grid line (96) but
		// only 1 off the neighbour edge at x=110 — the neighbour wins.
		const neighbor = box(110, 1000, 142, 1032);
		const result = snap(
			box(111, 0, 143, 32),
			{ x: 111, y: 0 },
			ctx({ neighbors: [neighbor] }),
		);
		expect(result.x).toBe(110);
		expect(result.y).toBe(0);
		expect(result.guides).toHaveLength(1);
		expect(result.guides[0]!.axis).toBe("x");
		expect(result.guides[0]!.position).toBe(110);
	});
});
