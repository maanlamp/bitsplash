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
import { HitsplatComponent } from "../src/game/hitsplat/hitsplat-component";
import { HitsplatStyleComponent } from "../src/game/hitsplat/hitsplat-style-component";
import {
	HITSPLAT_POOL_SIZE,
	Hitsplats,
	hitsplatMainId,
} from "../src/game/hitsplat/hitsplat-hud";
import { HitsplatHudSystem } from "../src/game/hitsplat/hitsplat-hud-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const ctxFor = (ecs: ECS): UpdateContext =>
	({ ecs }) as unknown as UpdateContext;

const mount = (): UiRoot => {
	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(Hitsplats)),
	);
	return root;
};

const dynOf = (root: UiRoot, dyn: DynStore, slot: number) => {
	const node = findById(root.tree, hitsplatMainId(slot))!;
	return dyn.get(node.id);
};

test("hitsplat pool renders a fixed set of world-layer text nodes", () => {
	const root = mount();
	let count = 0;
	const walk = (node: UiNode): void => {
		if (node.type === "text" && node.props.worldLayer === "terrain") {
			count++;
		}
		for (const child of node.children) {
			walk(child);
		}
	};
	walk(root.tree);
	expect(count).toBe(HITSPLAT_POOL_SIZE * 2);
});

test("active hitsplats drive pool slots via dyn (text/pos/visible)", () => {
	const ecs = new ECS();
	ecs.createEntity([new HitsplatStyleComponent()]);
	ecs.createEntity([
		new HitsplatComponent("12"),
		new TransformComponent(new Vector2(30, 40)),
	]);

	const root = mount();
	const dyn = new DynStore();
	const system = new HitsplatHudSystem(root, dyn);
	system.update(ctxFor(ecs));

	const slot0 = dynOf(root, dyn, 0);
	expect(slot0?.visible).toBe(true);
	expect(slot0?.text).toBe("12");
	expect(slot0?.worldX).toBe(30);
	expect(slot0?.worldY).toBe(40);
	// Unused slots hidden.
	expect(dynOf(root, dyn, 5)?.visible).toBe(false);
});

test("pool keeps a stable entity→slot mapping across despawns (no reshuffle)", () => {
	const ecs = new ECS();
	ecs.createEntity([new HitsplatStyleComponent()]);
	const a = ecs.createEntity([
		new HitsplatComponent("A"),
		new TransformComponent(new Vector2(0, 0)),
	]);
	ecs.createEntity([
		new HitsplatComponent("B"),
		new TransformComponent(new Vector2(1, 1)),
	]);

	const root = mount();
	const dyn = new DynStore();
	const system = new HitsplatHudSystem(root, dyn);
	system.update(ctxFor(ecs));
	expect(dynOf(root, dyn, 0)?.text).toBe("A");
	expect(dynOf(root, dyn, 1)?.text).toBe("B");

	ecs.destroy(a);
	ecs.flushDestroyed();
	system.update(ctxFor(ecs));
	// A's slot is released + hidden; B keeps its slot and text.
	expect(dynOf(root, dyn, 0)?.visible).toBe(false);
	expect(dynOf(root, dyn, 1)?.text).toBe("B");
	expect(dynOf(root, dyn, 1)?.visible).toBe(true);
});
