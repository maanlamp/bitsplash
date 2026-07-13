import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import { HealthComponent } from "../src/game/health/health-component";
import { HealthBarStateComponent } from "../src/game/health/health-bar-state-component";
import {
	HealthBars,
	healthNodeId,
} from "../src/game/health/health-bar-hud";
import { HealthBarHudState } from "../src/game/health/health-bar-hud-state";
import { HealthBarHudSystem } from "../src/game/health/health-bar-hud-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const ctxFor = (ecs: ECS): UpdateContext =>
	({ ecs }) as unknown as UpdateContext;

test("health bars: entity-set → keyed nodes, per-frame fill + world-space position via dyn", () => {
	const ecs = new ECS();
	const body = new PhysicsBodyComponent();
	body.body = { halfExtents: new Vector2(8, 8) } as never;
	const bar = new HealthBarStateComponent(100);
	bar.visible = 1 as never;
	bar.displayed = 80;
	const id = ecs.createEntity([
		new HealthComponent(100, 60),
		new TransformComponent(new Vector2(10, 20)),
		body,
		bar,
	]);

	const store = new HealthBarHudState();
	const root = new UiRoot();
	const dyn = new DynStore();
	const system = new HealthBarHudSystem(store, root, dyn);

	// First pass populates the entity-id set (structural).
	system.update(ctxFor(ecs));
	expect(store.getSnapshot()).toEqual([id]);

	// React renders one keyed node subtree per id.
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(HealthBars, { store })),
	);
	const container = findById(root.tree, healthNodeId(id))!;
	expect(container).not.toBeNull();
	// World-space: painted into a world (camera-transformed) layer.
	expect(container.props.worldLayer).toBe("terrain");

	// Second pass writes per-frame values now that the nodes exist. The bar
	// anchors at the entity's WORLD position (no screen projection).
	system.update(ctxFor(ecs));
	const c = dyn.get(container.id)!;
	expect(c.alpha).toBeGreaterThan(0);
	expect(c.worldX).toBe(10);
	expect(c.worldY).toBe(20 + 8 * -2 - 4);

	const actual = findById(root.tree, `${healthNodeId(id)}-actual`)!;
	expect(dyn.get(actual.id)?.width).toBe(Math.ceil((32 / 100) * 60));
	expect(typeof dyn.get(actual.id)?.backgroundColor).toBe("string");
	const displayed = findById(
		root.tree,
		`${healthNodeId(id)}-displayed`,
	)!;
	expect(dyn.get(displayed.id)?.width).toBe(
		Math.ceil((32 / 100) * 80),
	);
});

test("health bar hides (alpha 0) when the bar is not visible", () => {
	const ecs = new ECS();
	const body = new PhysicsBodyComponent();
	body.body = { halfExtents: new Vector2(8, 8) } as never;
	const id = ecs.createEntity([
		new HealthComponent(100, 100),
		new TransformComponent(new Vector2(0, 0)),
		body,
		new HealthBarStateComponent(100),
	]);

	const store = new HealthBarHudState();
	const root = new UiRoot();
	const dyn = new DynStore();
	const system = new HealthBarHudSystem(store, root, dyn);
	system.update(ctxFor(ecs));
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(HealthBars, { store })),
	);
	system.update(ctxFor(ecs));

	const container = findById(root.tree, healthNodeId(id))!;
	expect(dyn.get(container.id)?.alpha).toBe(0);
});
