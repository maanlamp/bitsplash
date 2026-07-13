import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { ECS } from "../src/engine/ecs";
import type { Milliseconds } from "../src/engine/duration";
import type {
	RenderContext,
	UpdateContext,
} from "../src/engine/system";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import { QuestNoticeComponent } from "../src/game/quest/quest-notice-component";
import { DeathNoticeComponent } from "../src/game/respawn/death-notice-component";
import {
	DEATH_OVERLAY_ID,
	GameHud,
	QUEST_NOTICE_ID,
} from "../src/game/ui/game-hud";
import { HudDynSystem } from "../src/game/ui/hud-dyn-system";
import { HudState } from "../src/game/ui/hud-state";
import { HudSyncSystem } from "../src/game/ui/hud-sync-system";

beforeAll(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = false;
});

const renderCtx = (ecs: ECS): RenderContext =>
	({ ecs }) as unknown as RenderContext;

const updateCtx = (ecs: ECS): UpdateContext =>
	({ ecs }) as unknown as UpdateContext;

const mount = (hud: HudState): UiRoot => {
	const root = new UiRoot();
	root.flushSyncFromReconciler(() =>
		root.mount(createElement(GameHud, { hud })),
	);
	return root;
};

const hasText = (node: UiNode, text: string): boolean => {
	if (node.type === "text" && node.props.children === text) {
		return true;
	}
	return node.children.some((child) => hasText(child, text));
};

test("death overlay node is always present; dyn drives visible/alpha", () => {
	const root = mount(new HudState());
	const node = findById(root.tree, DEATH_OVERLAY_ID)!;
	expect(node).not.toBeNull();
	expect(hasText(node, "You died")).toBe(true);

	const dyn = new DynStore();
	const system = new HudDynSystem(root, dyn);

	system.render(renderCtx(new ECS()));
	expect(dyn.get(node.id)?.visible).toBe(false);

	const ecs = new ECS();
	const death = new DeathNoticeComponent();
	death.fade.tick(1000 as Milliseconds);
	ecs.createEntity([death]);
	system.render(renderCtx(ecs));
	expect(dyn.get(node.id)?.visible).toBe(true);
	expect(dyn.get(node.id)?.alpha).toBe(1);
});

test("quest notice renders its text when set, and dyn fades it", () => {
	const hud = new HudState();
	const root = mount(hud);
	expect(findById(root.tree, QUEST_NOTICE_ID)).toBeNull();

	root.flushSyncFromReconciler(() => hud.setNotice("Quest updated"));
	const node = findById(root.tree, QUEST_NOTICE_ID)!;
	expect(node).not.toBeNull();
	expect(hasText(node, "Quest updated")).toBe(true);

	const dyn = new DynStore();
	const system = new HudDynSystem(root, dyn);
	const ecs = new ECS();
	const notice = new QuestNoticeComponent("Quest updated");
	notice.fade.tick(1000 as Milliseconds);
	ecs.createEntity([notice]);
	system.render(renderCtx(ecs));
	expect(dyn.get(node.id)?.visible).toBe(true);
	expect(dyn.get(node.id)?.alpha).toBe(1);
});

test("quest tracker renders one text node per line", () => {
	const hud = new HudState();
	const root = mount(hud);
	root.flushSyncFromReconciler(() =>
		hud.setQuestLines(["Collect 3 apples", "Talk to the smith"]),
	);
	expect(hasText(root.tree, "Collect 3 apples")).toBe(true);
	expect(hasText(root.tree, "Talk to the smith")).toBe(true);
});

test("HudSyncSystem mirrors quest-notice text into the store", () => {
	const hud = new HudState();
	const system = new HudSyncSystem(hud);

	const ecs = new ECS();
	system.update(updateCtx(ecs));
	expect(hud.getSnapshot().notice).toBeNull();

	ecs.createEntity([new QuestNoticeComponent("New quest!")]);
	system.update(updateCtx(ecs));
	expect(hud.getSnapshot().notice).toBe("New quest!");
});

test("HudState only emits when the snapshot actually changes", () => {
	const hud = new HudState();
	let emits = 0;
	hud.subscribe(() => emits++);
	hud.setNotice("a");
	hud.setNotice("a");
	hud.setQuestLines(["x"]);
	hud.setQuestLines(["x"]);
	expect(emits).toBe(2);
});
