import { describe, expect, test } from "bun:test";
import { ActiveScene } from "../src/editor/active-scene";
import { EditorState } from "../src/editor/editor-state";
import {
	SelectionChannel,
	type SelectionContext,
} from "../src/editor/selection-channel";
import type { ECS, EntityId } from "../src/engine/ecs";
import type { SceneDocument } from "../src/editor/scene-document";

const A = "a" as EntityId;

/**
 * Reproduces the inspector-blank regression: the editor sets the active scene
 * id from the persisted workspace on its first commit, **before** the project
 * (and thus each scene's store/document) exists, so `resolve` returns null. The
 * project then loads asynchronously, but the active id is unchanged — and
 * because {@link ActiveScene.set} notifies only on a *changed* id, the channel
 * never re-resolves and its snapshot stays null forever.
 *
 * The shell's fix is to leave the active scene `null` until its view (hence the
 * project) exists, so the first non-null id is set once `resolve` succeeds.
 * These tests pin the channel behaviour that fix relies on.
 */
describe("selection channel late-resolution binding", () => {
	const context = (store: EditorState): SelectionContext => ({
		store,
		document: {} as SceneDocument,
		ecs: {} as ECS,
	});

	test("resolving null on bind and re-setting the same id leaves the snapshot stuck null", () => {
		const store = new EditorState();
		let ready = false;
		const active = new ActiveScene();
		const channel = new SelectionChannel(active, () =>
			ready ? context(store) : null,
		);

		// Active id set before the context is resolvable (project not loaded).
		active.set("demo");
		expect(channel.snapshot).toBeNull();

		// Project becomes available, but the id is re-set to the same value: a
		// no-op that never re-resolves. This is the bug.
		ready = true;
		active.set("demo");
		expect(channel.snapshot).toBeNull();
	});

	test("clearing then setting the id once resolvable binds the channel", () => {
		const store = new EditorState();
		let ready = false;
		const active = new ActiveScene();
		const channel = new SelectionChannel(active, () =>
			ready ? context(store) : null,
		);

		active.set("demo");
		expect(channel.snapshot).toBeNull();

		// The fix's ordering: hold the active id null until resolvable, so the
		// first real id is a genuine change that triggers a successful resolve.
		ready = true;
		active.set(null);
		active.set("demo");
		expect(channel.snapshot).not.toBeNull();

		// And the now-bound channel tracks selection as normal.
		store.selectOne(A);
		expect(channel.snapshot?.selection.primaryId).toBe(A);
		expect(channel.snapshot?.selection.ids.size).toBe(1);
	});
});
