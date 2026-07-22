import { describe, expect, test } from "bun:test";
import {
	clearAttachmentPoint,
	createAttachmentName,
	deleteAttachmentName,
	renameAttachmentName,
	setAttachmentPoint,
} from "../src/editor/sprite/attachment-commands";
import { CelStore } from "../src/editor/sprite/cel-store";
import { History } from "../src/editor/history";
import type { SpriteDocument } from "../src/editor/sprite/sprite-document";

/**
 * The attachment-editing document model: create/rename/delete a point name and
 * set/clear a per-frame point, each an undoable command with a **real inverse**.
 * A raw {@link CelStore} stands in for the document — the attachment accessors and
 * mutations live on the store and carry identical signatures to the document
 * wrappers, so the real artifact is exercised without the DOM shell. Only the
 * inert choke-point hooks are stubbed.
 */
const asDoc = (store: CelStore): SpriteDocument => {
	const target = store as unknown as {
		commitPendingFloatingEdit: () => void;
		captureSelection: () => null;
		restoreSelection: () => void;
	};
	target.commitPendingFloatingEdit = () => {};
	target.captureSelection = () => null;
	target.restoreSelection = () => {};
	return store as unknown as SpriteDocument;
};

const setup = (): {
	store: CelStore;
	doc: SpriteDocument;
	history: History;
} => {
	const store = new CelStore(8, 8);
	return { store, doc: asDoc(store), history: new History() };
};

describe("attachment name commands", () => {
	test("create adds a name; undo removes it; redo re-adds", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		expect(store.attachmentNames()).toEqual(["grip"]);

		history.undo();
		await history.settle();
		expect(store.attachmentNames()).toEqual([]);

		history.redo();
		await history.settle();
		expect(store.attachmentNames()).toEqual(["grip"]);
	});

	test("create is a no-op (records nothing) when the name exists", async () => {
		const { doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		createAttachmentName(doc, history, "grip");
		// Only the first create recorded — one undo empties the stack.
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("rename preserves points; undo renames back", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		setAttachmentPoint(doc, history, "grip", 0, { x: 3, y: 4 });

		renameAttachmentName(doc, history, "grip", "hand");
		expect(store.attachmentNames()).toEqual(["hand"]);
		expect(store.attachmentPoint("hand", 0)).toEqual({ x: 3, y: 4 });

		history.undo();
		await history.settle();
		expect(store.attachmentNames()).toEqual(["grip"]);
		expect(store.attachmentPoint("grip", 0)).toEqual({ x: 3, y: 4 });
	});

	test("rename refuses to clobber an existing name", async () => {
		const { doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		createAttachmentName(doc, history, "hand");
		renameAttachmentName(doc, history, "grip", "hand");
		// No command recorded beyond the two creates.
		history.undo();
		await history.settle();
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("delete removes a name and all its frames; undo restores them exactly", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		setAttachmentPoint(doc, history, "grip", 0, { x: 1, y: 2 });
		setAttachmentPoint(doc, history, "grip", 3, { x: 5, y: 6 });

		deleteAttachmentName(doc, history, "grip");
		expect(store.attachmentNames()).toEqual([]);

		history.undo();
		await history.settle();
		expect(store.attachmentNames()).toEqual(["grip"]);
		expect(store.attachmentPoint("grip", 0)).toEqual({ x: 1, y: 2 });
		expect(store.attachmentPoint("grip", 3)).toEqual({ x: 5, y: 6 });
	});
});

describe("attachment point set/clear commands", () => {
	test("set on an existing name; undo restores the point's absence", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");

		setAttachmentPoint(doc, history, "grip", 2, { x: 4, y: 5 });
		expect(store.attachmentPoint("grip", 2)).toEqual({ x: 4, y: 5 });

		history.undo();
		await history.settle();
		expect(store.attachmentPoint("grip", 2)).toBeUndefined();
		// The name itself survives the point undo.
		expect(store.attachmentNames()).toEqual(["grip"]);

		history.redo();
		await history.settle();
		expect(store.attachmentPoint("grip", 2)).toEqual({ x: 4, y: 5 });
	});

	test("moving a point (set over an existing one); undo restores the prior point", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		setAttachmentPoint(doc, history, "grip", 0, { x: 1, y: 1 });

		setAttachmentPoint(doc, history, "grip", 0, { x: 7, y: 8 });
		expect(store.attachmentPoint("grip", 0)).toEqual({ x: 7, y: 8 });

		history.undo();
		await history.settle();
		expect(store.attachmentPoint("grip", 0)).toEqual({ x: 1, y: 1 });
	});

	test("set records nothing when the point is unchanged", async () => {
		const { doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		setAttachmentPoint(doc, history, "grip", 0, { x: 2, y: 2 });
		setAttachmentPoint(doc, history, "grip", 0, { x: 2, y: 2 });
		// The two recorded commands: create + first set. The no-op set adds none.
		history.undo();
		await history.settle();
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});

	test("set on an absent name creates it; undo removes the whole name", async () => {
		const { store, doc, history } = setup();
		setAttachmentPoint(doc, history, "grip", 0, { x: 9, y: 9 });
		expect(store.attachmentNames()).toEqual(["grip"]);

		history.undo();
		await history.settle();
		expect(store.attachmentNames()).toEqual([]);
	});

	test("clear removes a frame's point; undo restores it", async () => {
		const { store, doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		setAttachmentPoint(doc, history, "grip", 1, { x: 3, y: 3 });

		clearAttachmentPoint(doc, history, "grip", 1);
		expect(store.attachmentPoint("grip", 1)).toBeUndefined();

		history.undo();
		await history.settle();
		expect(store.attachmentPoint("grip", 1)).toEqual({ x: 3, y: 3 });
	});

	test("clear records nothing when there is no point", async () => {
		const { doc, history } = setup();
		createAttachmentName(doc, history, "grip");
		clearAttachmentPoint(doc, history, "grip", 0);
		// Only the create recorded — one undo empties the stack.
		history.undo();
		await history.settle();
		expect(history.canUndo).toBe(false);
	});
});
