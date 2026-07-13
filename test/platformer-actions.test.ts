import { expect, test } from "bun:test";
import { MemorySettingsStore } from "../src/engine/input/bindings/memory-settings-store";
import { expandBindings } from "../src/engine/input/bindings/ref-expansion";
import { token } from "../src/engine/input/edge-detector";
import { ACTION_IDS } from "../src/game/input/action-ids";
import { createPlatformerActions } from "../src/game/input/platformer-actions";
import { platformerCatalog } from "../src/game/input/platformer-catalog";

test("catalog contexts are ordered topmost-first", () => {
	expect(platformerCatalog.contexts).toEqual([
		"menu",
		"cutscene",
		"dialogue",
		"gameplay",
	]);
	expect(platformerCatalog.coexist).toEqual([]);
});

test("essential flags match the vocabulary", () => {
	const essential = new Set(
		platformerCatalog.actions
			.filter((a) => a.essential)
			.map((a) => a.id),
	);
	expect(essential).toEqual(
		new Set([
			ACTION_IDS.moveLeft,
			ACTION_IDS.moveRight,
			ACTION_IDS.moveUp,
			ACTION_IDS.moveDown,
			ACTION_IDS.pause,
			ACTION_IDS.menuConfirm,
			ACTION_IDS.menuCancel,
		]),
	);
});

test("defaults expand without dangling refs, cycles, or invalid tokens", () => {
	const expansion = expandBindings(platformerCatalog.defaults);
	expect(expansion.danglingRefs).toEqual([]);
	expect(expansion.droppedEdges).toEqual([]);
	expect(expansion.invalidChordTokens).toEqual([]);
});

test("dialogue.advance follows all of interact's bindings via ref", () => {
	const expansion = expandBindings(platformerCatalog.defaults);
	const advance =
		expansion.byAction.get(ACTION_IDS.dialogueAdvance) ?? [];
	const interact = expansion.byAction.get(ACTION_IDS.interact) ?? [];
	expect(advance.length).toBe(interact.length);
	expect(advance.every((b) => b.viaRef)).toBe(true);
	expect(advance.map((b) => b.source.tokens)).toEqual(
		interact.map((b) => b.source.tokens),
	);
	expect(
		advance.some((b) =>
			b.source.tokens.includes(token.keyboard("E")),
		),
	).toBe(true);
});

test("factory builds a resolver whose interact fires on E press", () => {
	const resolver = createPlatformerActions(new MemorySettingsStore());
	const down = {
		keyboard: { keys: { E: true } },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	const up = {
		keyboard: { keys: {} },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	resolver.step(up, 16);
	resolver.step(down, 16);
	expect(resolver.fired(ACTION_IDS.interact)).toBe(true);
	expect(resolver.fired(ACTION_IDS.dialogueAdvance)).toBe(true);
});

test("consuming interact suppresses dialogue.advance the same step", () => {
	const resolver = createPlatformerActions(new MemorySettingsStore());
	const down = {
		keyboard: { keys: { E: true } },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	const up = {
		keyboard: { keys: {} },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	resolver.step(up, 16);
	resolver.step(down, 16);
	resolver.consume(ACTION_IDS.interact);
	expect(resolver.fired(ACTION_IDS.dialogueAdvance)).toBe(false);
});

test("cutscene.skip is continuous and active while E is held", () => {
	const resolver = createPlatformerActions(new MemorySettingsStore());
	const held = {
		keyboard: { keys: { E: true } },
		mouse: {
			buttons: {},
			position: { x: 0, y: 0 },
			wheel: { x: 0, y: 0 },
		},
		gamepads: {},
	};
	resolver.step(held, 16);
	expect(resolver.active(ACTION_IDS.cutsceneSkip)).toBe(true);
});
