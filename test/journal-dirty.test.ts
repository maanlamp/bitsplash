import { expect, test } from "bun:test";
import { Journal } from "../src/editor/journal";
import type {
	JournalEntry,
	ReplayTarget,
} from "../src/editor/journal-entry";
import { ECS } from "../src/engine/ecs";
import { SceneConfig } from "../src/engine/scene/scene";
import type { World } from "../src/engine/world";

// A config-set entry touches only `target.config`, so a minimal fake world is
// enough to drive record/undo/redo here.
const asWorld = (ecs: ECS): World => ({ ecs }) as unknown as World;

const target = (): ReplayTarget => ({
	world: asWorld(new ECS()),
	config: new SceneConfig(),
});

const configSet = (before: number, after: number): JournalEntry => ({
	kind: "config-set",
	path: ["uiScale"],
	before,
	after,
});

test("a fresh journal is not dirty", () => {
	expect(new Journal().dirty).toBe(false);
});

test("undoing every edit back to the baseline reads clean again", () => {
	const journal = new Journal();
	const t = target();

	journal.record(configSet(1, 2), t);
	expect(journal.dirty).toBe(true);

	// The log is append-only, so undo appends an inverse rather than shrinking
	// the log — dirtiness must still return to false at the baseline.
	journal.undo(t);
	expect(journal.dirty).toBe(false);

	journal.redo(t);
	expect(journal.dirty).toBe(true);
});

test("dirtiness is measured against the last save point, not the baseline", () => {
	const journal = new Journal();
	const t = target();

	journal.record(configSet(1, 2), t);
	journal.markSaved();
	expect(journal.dirty).toBe(false);

	journal.undo(t);
	expect(journal.dirty).toBe(true);

	journal.redo(t);
	expect(journal.dirty).toBe(false);
});

test("a new edit on a diverged branch stays dirty (saved state unreachable)", () => {
	const journal = new Journal();
	const t = target();

	journal.record(configSet(1, 2), t);
	journal.markSaved();

	journal.undo(t);
	journal.record(configSet(1, 3), t);

	expect(journal.dirty).toBe(true);
});

test("reset clears the save point", () => {
	const journal = new Journal();
	const t = target();

	journal.record(configSet(1, 2), t);
	journal.markSaved();
	journal.reset();

	expect(journal.dirty).toBe(false);
});
