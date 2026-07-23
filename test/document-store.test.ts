import { describe, expect, test } from "bun:test";
import type { DocumentFactory } from "../src/editor/document/document-entry";
import {
	acquireDocument,
	disposeDocument,
	hasDocumentEntry,
} from "../src/editor/document/document-store";
import { Subscribable } from "../src/editor/subscribable";
import type { History } from "../src/editor/history";

class FakeDoc extends Subscribable {
	readonly dirty = false;
	constructor(readonly label: string) {
		super();
	}
}

type FakeControllers = {
	history: History;
	reset: number;
	disposed: number;
};

const factory = (
	label: string,
	loadKey: ReadonlyArray<unknown>,
): DocumentFactory<FakeDoc, FakeControllers> => ({
	loadKey,
	load: () => new FakeDoc(label),
	createControllers: (history) => ({
		history,
		reset: 0,
		disposed: 0,
	}),
	disposeControllers: (c) => {
		c.disposed += 1;
	},
	onReset: (c) => {
		c.reset += 1;
	},
});

describe("document store", () => {
	test("keys entries by view id and survives a consumer remount", () => {
		const view = "sprite:test-survive";
		const entry = acquireDocument(view, factory("a", [view]));
		const doc = entry.document;
		const { controllers, history, viewState } = entry;

		expect(doc).not.toBeNull();
		expect(controllers).not.toBeNull();

		history.push({ undo: () => {}, redo: () => {} });
		viewState.setCamera({ x: 3, y: 4, zoom: 2 });
		viewState.setTrackHeight(96);

		// A remount re-acquires the same view id with the same load key: the store
		// must hand back the identical entry, so document, history, controllers,
		// and declared view-state are all preserved (never rebuilt).
		const again = acquireDocument(view, factory("a", [view]));
		expect(again).toBe(entry);
		expect(again.document).toBe(doc);
		expect(again.controllers).toBe(controllers);
		expect(again.history).toBe(history);
		expect(again.history.canUndo).toBe(true);
		expect(again.viewState.camera).toEqual({ x: 3, y: 4, zoom: 2 });
		expect(again.viewState.trackHeight).toBe(96);

		disposeDocument(view);
	});

	test("reloads in place when the load key changes", () => {
		const view = "sprite:test-reload";
		const entry = acquireDocument(view, factory("first", [view, 1]));
		const doc = entry.document;
		const { controllers } = entry;
		entry.history.push({ undo: () => {}, redo: () => {} });

		const reloaded = acquireDocument(
			view,
			factory("second", [view, 2]),
		);
		expect(reloaded).toBe(entry);
		expect(reloaded.controllers).toBe(controllers);
		expect(controllers.reset).toBe(1);
		expect(reloaded.document).not.toBe(doc);
		expect(reloaded.document?.label).toBe("second");
		expect(reloaded.history.canUndo).toBe(false);

		disposeDocument(view);
	});

	test("dispose clears the entry and its controllers", () => {
		const view = "sprite:test-dispose";
		const entry = acquireDocument(view, factory("a", [view]));
		const { controllers } = entry;
		expect(hasDocumentEntry(view)).toBe(true);

		disposeDocument(view);
		expect(hasDocumentEntry(view)).toBe(false);
		expect(controllers.disposed).toBe(1);

		// A dispose is a no-op for a view with no entry.
		disposeDocument(view);
		expect(controllers.disposed).toBe(1);

		// Re-acquiring after dispose builds a fresh entry: new document, new
		// controllers, cleared view-state.
		const fresh = acquireDocument(view, factory("b", [view]));
		expect(fresh).not.toBe(entry);
		expect(fresh.controllers).not.toBe(controllers);
		expect(fresh.viewState.camera).toBeNull();
		expect(fresh.viewState.trackHeight).toBeNull();

		disposeDocument(view);
	});

	test("resolves an async load", async () => {
		const view = "sprite:test-async";
		const entry = acquireDocument(view, {
			loadKey: [view],
			load: () => Promise.resolve(new FakeDoc("async")),
			createControllers: (history) => ({
				history,
				reset: 0,
				disposed: 0,
			}),
		});
		expect(entry.document).toBeNull();
		await Promise.resolve();
		expect(entry.document?.label).toBe("async");

		disposeDocument(view);
	});
});
