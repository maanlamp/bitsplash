import { describe, expect, test } from "bun:test";
import { GestureController } from "../src/editor/sprite/gesture-controller";
import type { SpriteToolId } from "../src/editor/sprite/sprite-tool-id";
import type {
	SpriteTool,
	ToolContext,
} from "../src/editor/sprite/tool-strategy";

/**
 * A document stub whose only observable is `strokeActive`, driven by the same
 * begin/commit/cancel calls the real {@link StrokeTool} makes. The controller
 * reads `strokeActive` after `onDown` to decide whether a gesture went live, so
 * this is the exact contract that matters.
 */
class FakeDoc {
	private open = false;
	readonly log: string[] = [];
	get strokeActive(): boolean {
		return this.open;
	}
	beginStroke(): void {
		this.open = true;
		this.log.push("begin");
	}
	commitStroke(): void {
		this.open = false;
		this.log.push("commit");
	}
	cancelStroke(): void {
		this.open = false;
		this.log.push("cancel");
	}
}

/** A tool that mirrors StrokeTool's begin/commit/cancel side-effects. */
class FakeStrokeTool implements SpriteTool {
	constructor(
		readonly id: SpriteToolId,
		private readonly log: string[],
	) {}
	onDown(ctx: ToolContext): void {
		if (ctx.button !== 0 || !ctx.overImage) {
			return;
		}
		this.log.push(`${this.id}:down`);
		(ctx.doc as unknown as FakeDoc).beginStroke();
	}
	onMove(): void {
		this.log.push(`${this.id}:move`);
	}
	onUp(ctx: ToolContext): void {
		this.log.push(`${this.id}:up`);
		(ctx.doc as unknown as FakeDoc).commitStroke();
	}
	onCancel(ctx: ToolContext): void {
		this.log.push(`${this.id}:cancel`);
		(ctx.doc as unknown as FakeDoc).cancelStroke();
	}
	cursor(): string {
		return "none";
	}
}

const makeCtx = (
	doc: FakeDoc,
	opts: Partial<{
		x: number;
		y: number;
		overImage: boolean;
		button: number;
		pointerId: number;
	}> = {},
): ToolContext =>
	({
		doc: doc as unknown as ToolContext["doc"],
		x: opts.x ?? 0,
		y: opts.y ?? 0,
		overImage: opts.overImage ?? true,
		button: opts.button ?? 0,
		pressure: 0,
		pointerId: opts.pointerId ?? 1,
		capture: () => {},
		paint: () => {},
		erase: () => {},
	}) as unknown as ToolContext;

describe("gesture controller", () => {
	test("down opens a gesture owned by the pressing tool", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(new FakeStrokeTool("brush", log), makeCtx(doc));

		expect(gesture.active).toBe(true);
		expect(gesture.ownerToolId).toBe("brush");
		expect(doc.log).toEqual(["begin"]);
	});

	test("down→move→up commits once and returns to idle", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();
		const brush = new FakeStrokeTool("brush", log);

		gesture.down(brush, makeCtx(doc));
		gesture.move(makeCtx(doc, { x: 2 }));
		gesture.up(makeCtx(doc, { x: 2 }));

		expect(log).toEqual(["brush:down", "brush:move", "brush:up"]);
		expect(doc.log).toEqual(["begin", "commit"]);
		expect(gesture.active).toBe(false);
		expect(gesture.ownerToolId).toBeNull();
	});

	test("a tool change mid-stroke cancels the gesture and goes idle", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(new FakeStrokeTool("brush", log), makeCtx(doc));
		gesture.syncTool("eraser", makeCtx(doc));

		expect(log).toEqual(["brush:down", "brush:cancel"]);
		expect(doc.log).toEqual(["begin", "cancel"]);
		expect(gesture.active).toBe(false);
	});

	test("syncTool to the owning tool's own id is a no-op (color change, etc.)", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(new FakeStrokeTool("brush", log), makeCtx(doc));
		gesture.syncTool("brush", makeCtx(doc));

		expect(gesture.active).toBe(true);
		expect(doc.log).toEqual(["begin"]);
	});

	test("move and up are inert while idle", () => {
		const doc = new FakeDoc();
		const gesture = new GestureController();

		gesture.move(makeCtx(doc));
		gesture.up(makeCtx(doc));

		expect(doc.log).toEqual([]);
		expect(gesture.active).toBe(false);
	});

	test("a foreign pointer's up cannot end another pointer's stroke", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(
			new FakeStrokeTool("brush", log),
			makeCtx(doc, { pointerId: 1 }),
		);
		gesture.up(makeCtx(doc, { pointerId: 9 }));

		expect(gesture.active).toBe(true);
		expect(doc.log).toEqual(["begin"]);
	});

	test("a press that opens no stroke (off-image) leaves the controller idle", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(
			new FakeStrokeTool("brush", log),
			makeCtx(doc, { overImage: false }),
		);

		expect(gesture.active).toBe(false);
		expect(doc.log).toEqual([]);
	});

	test("a fresh down cancels a stroke stranded by a missed up", () => {
		const doc = new FakeDoc();
		const log: string[] = [];
		const gesture = new GestureController();

		gesture.down(new FakeStrokeTool("brush", log), makeCtx(doc));
		// No up arrives; a new press begins. The stale stroke is cancelled first.
		gesture.down(new FakeStrokeTool("brush", log), makeCtx(doc));

		expect(doc.log).toEqual(["begin", "cancel", "begin"]);
		expect(gesture.active).toBe(true);
	});
});
