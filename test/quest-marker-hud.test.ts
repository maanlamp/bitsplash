import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import { QuestMarkerTagComponent } from "../src/game/quest/quest-marker-tag-component";
import {
	QuestMarkers,
	markerNodeId,
} from "../src/game/quest/quest-marker-hud";
import { QuestMarkerHudState } from "../src/game/quest/quest-marker-hud-state";
import { QuestMarkerHudSystem } from "../src/game/quest/quest-marker-hud-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const ctxFor = (ecs: ECS): UpdateContext =>
	({
		ecs,
		assetManager: { getImage: () => undefined },
		time: { elapsed: 0 },
	}) as unknown as UpdateContext;

const countType = (node: UiNode, type: string): number => {
	let n = node.type === type ? 1 : 0;
	for (const child of node.children) {
		n += countType(child, type);
	}
	return n;
};

test("quest marker: keyed world-space chevron node with line segments", () => {
	const store = new QuestMarkerHudState();
	const id = crypto.randomUUID();
	store.setIds([id]);
	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(QuestMarkers, { store })),
	);
	const node = findById(root.tree, markerNodeId(id))!;
	expect(node).not.toBeNull();
	expect(node.props.worldLayer).toBe("overlay");
	// Two chevrons (outline + fill), two line segments each.
	expect(countType(node, "line")).toBe(4);
});

test("quest markers hide when no quest objective is active", () => {
	const ecs = new ECS();
	ecs.createEntity([
		new QuestMarkerTagComponent(),
		new TransformComponent(new Vector2(0, 0)),
	]);
	const store = new QuestMarkerHudState();
	const system = new QuestMarkerHudSystem(
		store,
		new UiRoot(),
		new DynStore(),
	);
	system.update(ctxFor(ecs));
	expect(store.getSnapshot()).toEqual([]);
});
