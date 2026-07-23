import { describe, expect, test } from "bun:test";
import { ClosedStack } from "../src/editor/workspace/closed-stack";
import {
	allViewIds,
	findView,
	type WindowLayout,
} from "../src/editor/workspace/layout";

const always = () => true;
const never = () => false;

const win = (views: ReadonlyArray<string>): WindowLayout => ({
	id: "sat",
	focused: views[0] ?? null,
	root: {
		type: "tabs",
		id: "tg-1",
		views,
		active: views[0] ?? "",
	},
});

describe("closed-stack record semantics", () => {
	test("pushView then materialize returns the record", () => {
		const stack = new ClosedStack().pushView(
			"sprite:a",
			"tg-1",
			"hub",
		);
		const result = stack.materialize(never, always);
		expect(result).not.toBeNull();
		expect(result!.record).toEqual({
			kind: "view",
			viewId: "sprite:a",
			tabGroupId: "tg-1",
			windowId: "hub",
		});
		expect(result!.next.size).toBe(0);
	});

	test("pushView is immutable", () => {
		const empty = new ClosedStack();
		const one = empty.pushView("sprite:a", "tg-1", "hub");
		expect(empty.size).toBe(0);
		expect(one.size).toBe(1);
	});

	test("a dead view is pruned and materialize yields null", () => {
		const stack = new ClosedStack().pushView(
			"sprite:a",
			"tg-1",
			"hub",
		);
		expect(stack.materialize(never, never)).toBeNull();
	});

	test("an already-open view is pruned (open wins)", () => {
		const stack = new ClosedStack().pushView(
			"sprite:a",
			"tg-1",
			"hub",
		);
		const isOpen = (id: string) => id === "sprite:a";
		expect(stack.materialize(isOpen, always)).toBeNull();
	});

	test("an empty record is discarded and the next entry pops", () => {
		const stack = new ClosedStack()
			.pushView("sprite:a", "tg-1", "hub")
			.pushView("sprite:b", "tg-2", "hub");
		const isValid = (id: string) => id !== "sprite:b";
		const result = stack.materialize(never, isValid);
		expect(result).not.toBeNull();
		expect(result!.record.kind).toBe("view");
		if (result!.record.kind === "view") {
			expect(result!.record.viewId).toBe("sprite:a");
		}
		expect(result!.next.size).toBe(0);
	});

	test("window record resurrects with surviving views only", () => {
		const stack = new ClosedStack().pushWindow(
			{ x: 0, y: 0, width: 800, height: 600 },
			win(["inspector", "console"]),
		);
		const isOpen = (id: string) => id === "console";
		const result = stack.materialize(isOpen, always);
		expect(result).not.toBeNull();
		const record = result!.record;
		expect(record.kind).toBe("window");
		if (record.kind === "window") {
			expect(record.views).toEqual(["inspector"]);
			expect(allViewIds(record.layout.root)).toEqual(["inspector"]);
			expect(findView(record.layout.root, "console")).toBeNull();
			expect(record.bounds.width).toBe(800);
		}
		expect(result!.next.size).toBe(0);
	});

	test("window record round-trips its real bounds", () => {
		const stack = new ClosedStack().pushWindow(
			{ x: 120, y: 64, width: 1024, height: 768 },
			win(["inspector"]),
		);
		const result = stack.materialize(never, always);
		expect(result).not.toBeNull();
		const record = result!.record;
		if (record.kind === "window") {
			expect(record.bounds).toEqual({
				x: 120,
				y: 64,
				width: 1024,
				height: 768,
			});
		}
	});

	test("transient new-asset views are pruned before judging emptiness", () => {
		// A window that held only a transient sprite:new draft records nothing to
		// resurrect: sprite:new is invalid, so the record prunes empty and pops.
		const stack = new ClosedStack().pushWindow(
			{ x: 0, y: 0, width: 800, height: 600 },
			win(["sprite:new"]),
		);
		const isValid = (id: string) => id !== "sprite:new";
		expect(stack.materialize(never, isValid)).toBeNull();
	});

	test("a fully-open window record is discarded, next view pops", () => {
		const stack = new ClosedStack()
			.pushView("sprite:a", "tg-1", "hub")
			.pushWindow(
				{ x: 0, y: 0, width: 800, height: 600 },
				win(["inspector", "console"]),
			);
		const isOpen = (id: string) =>
			id === "inspector" || id === "console";
		const result = stack.materialize(isOpen, always);
		expect(result).not.toBeNull();
		expect(result!.record.kind).toBe("view");
		if (result!.record.kind === "view") {
			expect(result!.record.viewId).toBe("sprite:a");
		}
		expect(result!.next.size).toBe(0);
	});
});
