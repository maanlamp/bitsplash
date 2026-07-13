import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import { ScreenFadeComponent } from "../src/engine/fade/screen-fade-component";
import type { RenderContext } from "../src/engine/system";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import {
	SCREEN_FADE_ID,
	ScreenFade,
} from "../src/game/ui/screen-fade";
import { ScreenFadeHudSystem } from "../src/game/ui/screen-fade-hud-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const renderCtx = (ecs: ECS): RenderContext =>
	({ ecs }) as unknown as RenderContext;

const mount = (): UiRoot => {
	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(ScreenFade)),
	);
	return root;
};

test("screen-fade overlay is present in the committed tree", () => {
	const root = mount();
	expect(findById(root.tree, SCREEN_FADE_ID)).not.toBeNull();
});

test("fade alpha is bypassed to dyn each frame; absent fade => 0", () => {
	const root = mount();
	const dyn = new DynStore();
	const system = new ScreenFadeHudSystem(root, dyn);
	const node = findById(root.tree, SCREEN_FADE_ID)!;

	const ecs = new ECS();
	system.render(renderCtx(ecs));
	expect(dyn.get(node.id)?.alpha).toBe(0);

	ecs.createEntity([new ScreenFadeComponent(0.5)]);
	system.render(renderCtx(ecs));
	expect(dyn.get(node.id)?.alpha).toBe(0.5);
});

test("fade alpha is clamped to [0,1]", () => {
	const root = mount();
	const dyn = new DynStore();
	const system = new ScreenFadeHudSystem(root, dyn);
	const node = findById(root.tree, SCREEN_FADE_ID)!;

	const ecs = new ECS();
	ecs.createEntity([new ScreenFadeComponent(2)]);
	system.render(renderCtx(ecs));
	expect(dyn.get(node.id)?.alpha).toBe(1);
});
