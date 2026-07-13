import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import { LastUsedDevice } from "../src/engine/input/last-used-device";
import type {
	RenderContext,
	UpdateContext,
} from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import { InteractableComponent } from "../src/game/interaction/interactable-component";
import { InteractionStateComponent } from "../src/game/interaction/interaction-state-component";
import {
	INTERACT_HINT_ID,
	InteractHint,
} from "../src/game/interaction/interact-hint-hud";
import { InteractHintHudState } from "../src/game/interaction/interact-hint-hud-state";
import { InteractHintHudSystem } from "../src/game/interaction/interact-hint-hud-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const emptyExpansion = {
	bindings: [],
	byAction: new Map(),
	danglingRefs: [],
	droppedEdges: [],
	invalidChordTokens: [],
};

const ctxFor = (ecs: ECS): UpdateContext =>
	({
		ecs,
		assetManager: {
			getImage: () => undefined,
			getImageMetadata: () => undefined,
		},
		actions: { getExpansion: () => emptyExpansion },
		input: {
			keyboard: { keys: {} },
			mouse: {
				buttons: {},
				position: { x: 0, y: 0 },
				wheel: { x: 0, y: 0 },
			},
			gamepads: {},
		},
	}) as unknown as UpdateContext;

const hasText = (node: UiNode, text: string): boolean => {
	if (node.type === "text" && node.props.children === text) {
		return true;
	}
	return node.children.some((child) => hasText(child, text));
};

test("interact hint: key-cap appears for the in-range entity, world-space", () => {
	const ecs = new ECS();
	const target = ecs.createEntity([
		new InteractableComponent(),
		new TransformComponent(new Vector2(30, 40)),
	]);
	const stateComponent = new InteractionStateComponent();
	stateComponent.inRange = target;
	ecs.createEntity([stateComponent]);

	const hud = new InteractHintHudState();
	const root = new UiRoot();
	const dyn = new DynStore();
	const system = new InteractHintHudSystem(
		hud,
		root,
		dyn,
		new LastUsedDevice(),
	);

	system.update(ctxFor(ecs));
	expect(hud.getSnapshot().entity).toBe(target);
	expect(hud.getSnapshot().glyph).toBe("E");

	root.flushSyncFromReconciler(() =>
		root.mount(createElement(InteractHint, { store: hud })),
	);
	const node = findById(root.tree, INTERACT_HINT_ID)!;
	expect(node).not.toBeNull();
	expect(node.props.worldLayer).toBe("overlay");
	expect(hasText(node, "E")).toBe(true);

	system.update(ctxFor(ecs));
	// Anchored at the entity's WORLD position (centered: x - halfWidth).
	expect(dyn.get(node.id)?.worldX).toBe(30 - 20);
	expect(dyn.get(node.id)?.worldY).toBe(40 - 20);
});

test("interact hint clears when nothing is in range", () => {
	const ecs = new ECS();
	ecs.createEntity([new InteractionStateComponent()]);
	const hud = new InteractHintHudState();
	const root = new UiRoot();
	const system = new InteractHintHudSystem(
		hud,
		root,
		new DynStore(),
		new LastUsedDevice(),
	);
	system.update(ctxFor(ecs));
	expect(hud.getSnapshot().entity).toBeNull();

	root.flushSyncFromReconciler(() =>
		root.mount(createElement(InteractHint, { store: hud })),
	);
	expect(findById(root.tree, INTERACT_HINT_ID)).toBeNull();
});

test("InteractOutlineRenderSystem is a no-op without an in-range sprite", async () => {
	const { InteractOutlineRenderSystem } =
		await import("../src/game/interaction/interact-outline-render-system");
	const ecs = new ECS();
	ecs.createEntity([new InteractionStateComponent()]);
	let drewOutline = false;
	const ctx = {
		ecs,
		assetManager: { getImage: () => undefined },
		renderer: {
			drawImageOutline: () => {
				drewOutline = true;
			},
		},
	} as unknown as RenderContext;
	new InteractOutlineRenderSystem("entities").render(ctx);
	expect(drewOutline).toBe(false);
});
