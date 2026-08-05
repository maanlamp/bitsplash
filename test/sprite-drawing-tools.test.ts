import { describe, expect, test } from "bun:test";
import { BrushTool } from "../src/editor/sprite/brush-tool";
import { EyedropperTool } from "../src/editor/sprite/eyedropper-tool";
import { LineTool } from "../src/editor/sprite/line-tool";
import type {
	ToolContext,
	ToolSession,
} from "../src/editor/sprite/tool-strategy";

const newSession = (): ToolSession => ({
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
});

type Rec = {
	paint: Array<[number, number]>;
	calls: string[];
};

/** A tool context whose sink records paints and whose doc records lifecycle. */
const makeCtx = (
	rec: Rec,
	opts: Readonly<{
		x?: number;
		y?: number;
		button?: number;
		overImage?: boolean;
		brushSize?: number;
		brushShape?: "round" | "square";
		sample?: readonly [number, number, number, number] | null;
		setColor?: (c: unknown) => void;
	}> = {},
): ToolContext =>
	({
		doc: {
			core: {
				snapshot: () => ({ layerId: "l", frameIndex: 0, data: {} }),
				commitPendingFloatingEdit: () => {},
				captureSelection: () => null,
				restoreSelection: () => {},
			},
			beginStroke: () => rec.calls.push("begin"),
			clearStroke: () => rec.calls.push("clear"),
			refreshStrokePreview: () => rec.calls.push("refresh"),
			setStrokeOpacityScale: () => {},
		} as unknown as ToolContext["doc"],
		state: {
			modifiers: {
				ink: "normal",
				symmetry: "off",
				pixelPerfect: false,
				stabilizer: 0,
			},
			brushShape: opts.brushShape ?? "square",
			brushSize: opts.brushSize ?? 1,
			shapeFill: false,
			setColor: opts.setColor ?? (() => {}),
		} as unknown as ToolContext["state"],
		history: {} as ToolContext["history"],
		x: opts.x ?? 0,
		y: opts.y ?? 0,
		overImage: opts.overImage ?? true,
		button: opts.button ?? 0,
		pressure: 0,
		pointerId: 1,
		capture: () => rec.calls.push("capture"),
		paint: (x: number, y: number) => rec.paint.push([x, y]),
		erase: () => {},
		sample: () => opts.sample ?? null,
	}) as unknown as ToolContext;

describe("sized brush", () => {
	test("a 2×2 square dab stamps its whole footprint on press", () => {
		const rec: Rec = { paint: [], calls: [] };
		new BrushTool().onDown(
			makeCtx(rec, {
				x: 5,
				y: 7,
				brushSize: 2,
				brushShape: "square",
			}),
			newSession(),
		);
		expect(new Set(rec.paint.map((p) => p.join(",")))).toEqual(
			new Set(["5,7", "6,7", "5,8", "6,8"]),
		);
	});

	test("size 1 stamps a single cell (legacy behaviour)", () => {
		const rec: Rec = { paint: [], calls: [] };
		new BrushTool().onDown(
			makeCtx(rec, { x: 2, y: 3, brushSize: 1 }),
			newSession(),
		);
		expect(rec.paint).toEqual([[2, 3]]);
	});
});

describe("line tool", () => {
	test("press rasterises a dot; a move re-rasterises from origin", () => {
		const rec: Rec = { paint: [], calls: [] };
		const line = new LineTool();
		const session = newSession();
		const ctx = makeCtx(rec, { x: 0, y: 0 });
		line.onDown(ctx, session);
		expect(session.shape).toEqual({ x0: 0, y0: 0 });
		expect(rec.paint).toEqual([[0, 0]]);

		rec.paint.length = 0;
		line.onMove(makeCtx(rec, { x: 2, y: 0 }), session);
		// The buffer is cleared and the full line re-stamped each move.
		expect(rec.calls).toContain("clear");
		expect(rec.paint).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
		]);
	});
});

describe("eyedropper tool", () => {
	test("press samples the composite into the active colour", () => {
		const rec: Rec = { paint: [], calls: [] };
		let picked: { alpha: number } | null = null;
		const ctx = makeCtx(rec, {
			sample: [255, 0, 0, 128],
			setColor: (c) => {
				picked = c as { alpha: number };
			},
		});
		const session = newSession();
		new EyedropperTool().onDown(ctx, session);
		expect(picked).not.toBeNull();
		expect(picked!.alpha).toBeCloseTo(128 / 255, 5);
		expect(session.active).toBe(true);
	});

	test("a null sample (out of bounds) picks nothing", () => {
		const rec: Rec = { paint: [], calls: [] };
		let called = false;
		new EyedropperTool().onDown(
			makeCtx(rec, {
				sample: null,
				setColor: () => {
					called = true;
				},
			}),
			newSession(),
		);
		expect(called).toBe(false);
	});
});
