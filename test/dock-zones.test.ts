import { describe, expect, test } from "bun:test";
import {
	dockZone,
	type Rect,
	zoneRect,
} from "../src/editor/workspace/dock-zones";

/**
 * Regression coverage for the five-way dock partition (WS-E). Guards that every
 * zone — including bottom and right, which a systematic hit-test offset once
 * made unreachable — resolves from a representative interior point and paints
 * the correct half-rectangle.
 */

const rect: Rect = { left: 0, top: 0, width: 100, height: 100 };

describe("dockZone", () => {
	test("resolves all five zones at representative points", () => {
		expect(dockZone(rect, 50, 50)).toBe("center");
		expect(dockZone(rect, 50, 5)).toBe("top");
		expect(dockZone(rect, 50, 95)).toBe("bottom");
		expect(dockZone(rect, 5, 50)).toBe("left");
		expect(dockZone(rect, 95, 50)).toBe("right");
	});

	test("partition covers the whole rect (no dead area)", () => {
		const seen = new Set<string>();
		for (let y = 0; y < 100; y++) {
			for (let x = 0; x < 100; x++) {
				seen.add(dockZone(rect, x + 0.5, y + 0.5));
			}
		}
		expect([...seen].toSorted()).toEqual([
			"bottom",
			"center",
			"left",
			"right",
			"top",
		]);
	});

	test("an offset rect keeps bottom/right reachable", () => {
		const offset: Rect = {
			left: 300,
			top: 440,
			width: 200,
			height: 100,
		};
		expect(dockZone(offset, 400, 530)).toBe("bottom");
		expect(dockZone(offset, 480, 490)).toBe("right");
	});
});

describe("zoneRect", () => {
	test("splits into the correct half for each edge zone", () => {
		expect(zoneRect(rect, "left")).toEqual({
			left: 0,
			top: 0,
			width: 50,
			height: 100,
		});
		expect(zoneRect(rect, "right")).toEqual({
			left: 50,
			top: 0,
			width: 50,
			height: 100,
		});
		expect(zoneRect(rect, "top")).toEqual({
			left: 0,
			top: 0,
			width: 100,
			height: 50,
		});
		expect(zoneRect(rect, "bottom")).toEqual({
			left: 0,
			top: 50,
			width: 100,
			height: 50,
		});
		expect(zoneRect(rect, "center")).toEqual(rect);
	});
});
