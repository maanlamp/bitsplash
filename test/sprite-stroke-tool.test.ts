import { describe, expect, test } from "bun:test";
import { BrushTool } from "../src/editor/sprite/brush-tool";
import { EraserTool } from "../src/editor/sprite/eraser-tool";
import type {
	ToolContext,
	ToolSession,
} from "../src/editor/sprite/tool-strategy";

type Recorded = {
	paint: Array<[number, number]>;
	erase: Array<[number, number]>;
	calls: string[];
};

const scenario = () => {
	const rec: Recorded = { paint: [], erase: [], calls: [] };
	let captured = false;
	const base = {
		doc: {
			core: {
				snapshot: () => ({
					layerId: "layer",
					data: { data: new Uint8ClampedArray(0) },
				}),
				commitPendingFloatingEdit: () => {},
				captureSelection: () => null,
				restoreSelection: () => {},
			},
			beginStroke: () => rec.calls.push("begin"),
			commitStroke: () => rec.calls.push("commit"),
			cancelStroke: () => rec.calls.push("cancel"),
			refreshStrokePreview: () => {},
			setStrokeOpacityScale: () => {},
		} as unknown as ToolContext["doc"],
		state: {
			modifiers: {
				ink: "normal",
				symmetry: "off",
				pixelPerfect: false,
				stabilizer: 0,
			},
			brushShape: "round",
			brushSize: 1,
		} as unknown as ToolContext["state"],
		history: {} as ToolContext["history"],
		selection: {} as unknown as ToolContext["selection"],
		shiftKey: false,
		altKey: false,
		overImage: true,
		button: 0,
		pressure: 0,
		pointerId: 1,
		capture: () => {
			captured = true;
		},
		paint: (x: number, y: number) => rec.paint.push([x, y]),
		erase: (x: number, y: number) => rec.erase.push([x, y]),
		sample: () => null,
	};
	const ctx = (x: number, y: number): ToolContext => ({
		...base,
		x,
		y,
	});
	return { rec, ctx, wasCaptured: () => captured };
};

describe("stroke tool dispatch", () => {
	test("brush down opens the buffer, paints the first cell, captures", () => {
		const { rec, ctx, wasCaptured } = scenario();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		new BrushTool().onDown(ctx(5, 7), session);

		expect(rec.calls).toEqual(["begin"]);
		expect(rec.paint).toEqual([[5, 7]]);
		expect(wasCaptured()).toBe(true);
		expect(session.snapshot).not.toBeNull();
		expect(session.last).toEqual({ x: 5, y: 7 });
	});

	test("brush move Bresenham-interpolates between samples (gap-free)", () => {
		const { rec, ctx } = scenario();
		const brush = new BrushTool();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		brush.onDown(ctx(0, 0), session);
		brush.onMove(ctx(3, 0), session);

		expect(rec.paint).toEqual([
			[0, 0],
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0],
		]);
		expect(session.last).toEqual({ x: 3, y: 0 });
	});

	test("brush up commits the buffer exactly once, then clears session", () => {
		const { rec, ctx } = scenario();
		const brush = new BrushTool();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		brush.onDown(ctx(1, 1), session);
		brush.onUp(ctx(1, 1), session);

		expect(rec.calls).toEqual(["begin", "commit"]);
		expect(session.snapshot).toBeNull();
		expect(session.last).toBeNull();
	});

	test("cancel discards the buffer and clears session", () => {
		const { rec, ctx } = scenario();
		const brush = new BrushTool();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		brush.onDown(ctx(2, 2), session);
		brush.onCancel(ctx(2, 2), session);

		expect(rec.calls).toEqual(["begin", "cancel"]);
		expect(session.snapshot).toBeNull();
	});

	test("move before down does nothing (no live stroke)", () => {
		const { rec, ctx } = scenario();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		new BrushTool().onMove(ctx(2, 2), session);

		expect(rec.paint).toEqual([]);
	});

	test("up/cancel without a live stroke are inert", () => {
		const { rec, ctx } = scenario();
		const brush = new BrushTool();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		brush.onUp(ctx(1, 1), session);
		brush.onCancel(ctx(1, 1), session);

		expect(rec.calls).toEqual([]);
	});

	test("down outside the image or with a non-primary button is ignored", () => {
		const { rec, ctx } = scenario();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		new BrushTool().onDown(
			{ ...ctx(1, 1), overImage: false },
			session,
		);
		new BrushTool().onDown({ ...ctx(1, 1), button: 2 }, session);

		expect(rec.paint).toEqual([]);
		expect(rec.calls).toEqual([]);
		expect(session.snapshot).toBeNull();
	});

	test("eraser routes cells through erase, not paint", () => {
		const { rec, ctx } = scenario();
		const session: ToolSession = {
			snapshot: null,
			last: null,
			active: false,
			attachment: null,
			pp: null,
			stab: null,
			shape: null,
			selectionDrag: null,
			custom: null,
			transformDrag: null,
		};

		new EraserTool().onDown(ctx(4, 4), session);

		expect(rec.erase).toEqual([[4, 4]]);
		expect(rec.paint).toEqual([]);
	});
});
