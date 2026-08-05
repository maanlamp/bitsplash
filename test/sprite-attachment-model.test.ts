import { describe, expect, test } from "bun:test";
import {
	clearAttachmentPoint,
	createAttachmentName,
	deleteAttachmentName,
	renameAttachmentName,
	setAttachmentPoint,
} from "../src/editor/sprite/attachment-commands";
import { History } from "../src/editor/history";
import { SpriteEditCore } from "../src/editor/sprite/sprite-edit-core";

/**
 * The attachment-editing model: create/rename/delete a point name and set/clear a
 * per-frame point, each an undoable command with a **real inverse**, driven
 * against the real canvas-free {@link SpriteEditCore} the editor ships — no DOM
 * shell and no hand-written double.
 */

const setup = (): {
	core: SpriteEditCore;
	history: History;
} => ({ core: SpriteEditCore.create(8, 8), history: new History() });

describe("attachment name commands", () => {
	test("create adds a name; undo removes it; redo re-adds", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		expect(core.attachmentNames()).toEqual(["grip"]);

		history.undo();
		await history.settle();
		expect(core.attachmentNames()).toEqual([]);

		history.redo();
		await history.settle();
		expect(core.attachmentNames()).toEqual(["grip"]);
	});

	test("create is a no-op (records nothing) when the name exists", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		createAttachmentName(core, history, "grip");
		// Only the first create recorded — one undo empties the stack.
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("rename preserves points; undo renames back", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		setAttachmentPoint(core, history, "grip", 0, { x: 3, y: 4 });

		renameAttachmentName(core, history, "grip", "hand");
		expect(core.attachmentNames()).toEqual(["hand"]);
		expect(core.attachmentPoint("hand", 0)).toEqual({ x: 3, y: 4 });

		history.undo();
		await history.settle();
		expect(core.attachmentNames()).toEqual(["grip"]);
		expect(core.attachmentPoint("grip", 0)).toEqual({ x: 3, y: 4 });
	});

	test("rename refuses to clobber an existing name", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		createAttachmentName(core, history, "hand");
		renameAttachmentName(core, history, "grip", "hand");
		// No command recorded beyond the two creates.
		history.undo();
		await history.settle();
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("delete removes a name and all its frames; undo restores them exactly", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		setAttachmentPoint(core, history, "grip", 0, { x: 1, y: 2 });
		setAttachmentPoint(core, history, "grip", 3, { x: 5, y: 6 });

		deleteAttachmentName(core, history, "grip");
		expect(core.attachmentNames()).toEqual([]);

		history.undo();
		await history.settle();
		expect(core.attachmentNames()).toEqual(["grip"]);
		expect(core.attachmentPoint("grip", 0)).toEqual({ x: 1, y: 2 });
		expect(core.attachmentPoint("grip", 3)).toEqual({ x: 5, y: 6 });
	});
});

describe("attachment point set/clear commands", () => {
	test("set on an existing name; undo restores the point's absence", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");

		setAttachmentPoint(core, history, "grip", 2, { x: 4, y: 5 });
		expect(core.attachmentPoint("grip", 2)).toEqual({ x: 4, y: 5 });

		history.undo();
		await history.settle();
		expect(core.attachmentPoint("grip", 2)).toBeUndefined();
		// The name itself survives the point undo.
		expect(core.attachmentNames()).toEqual(["grip"]);

		history.redo();
		await history.settle();
		expect(core.attachmentPoint("grip", 2)).toEqual({ x: 4, y: 5 });
	});

	test("moving a point (set over an existing one); undo restores the prior point", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		setAttachmentPoint(core, history, "grip", 0, { x: 1, y: 1 });

		setAttachmentPoint(core, history, "grip", 0, { x: 7, y: 8 });
		expect(core.attachmentPoint("grip", 0)).toEqual({ x: 7, y: 8 });

		history.undo();
		await history.settle();
		expect(core.attachmentPoint("grip", 0)).toEqual({ x: 1, y: 1 });
	});

	test("set records nothing when the point is unchanged", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		setAttachmentPoint(core, history, "grip", 0, { x: 2, y: 2 });
		setAttachmentPoint(core, history, "grip", 0, { x: 2, y: 2 });
		// The two recorded commands: create + first set. The no-op set adds none.
		history.undo();
		await history.settle();
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("set on an absent name creates it; undo removes the whole name", async () => {
		const { core, history } = setup();
		setAttachmentPoint(core, history, "grip", 0, { x: 9, y: 9 });
		expect(core.attachmentNames()).toEqual(["grip"]);

		history.undo();
		await history.settle();
		expect(core.attachmentNames()).toEqual([]);
	});

	test("clear removes a frame's point; undo restores it", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		setAttachmentPoint(core, history, "grip", 1, { x: 3, y: 3 });

		clearAttachmentPoint(core, history, "grip", 1);
		expect(core.attachmentPoint("grip", 1)).toBeUndefined();

		history.undo();
		await history.settle();
		expect(core.attachmentPoint("grip", 1)).toEqual({ x: 3, y: 3 });
	});

	test("clear records nothing when there is no point", async () => {
		const { core, history } = setup();
		createAttachmentName(core, history, "grip");
		clearAttachmentPoint(core, history, "grip", 0);
		// Only the create recorded — one undo empties the stack.
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});
});
