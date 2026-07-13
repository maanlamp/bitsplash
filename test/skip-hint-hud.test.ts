import { beforeAll, expect, test } from "bun:test";
import { createElement } from "react";
import { CutsceneComponent } from "../src/engine/cutscene/cutscene-component";
import { SKIP_HOLD_SECONDS } from "../src/engine/cutscene/cutscene-system";
import { ECS } from "../src/engine/ecs";
import { LastUsedDevice } from "../src/engine/input/last-used-device";
import type { UpdateContext } from "../src/engine/system";
import { DynStore } from "../src/engine/ui/bypass/dyn-store";
import { findById } from "../src/engine/ui/input/node-tree";
import { UiRoot } from "../src/engine/ui/reconciler/ui-root";
import { holdRingNodeId } from "../src/game/ui/key-cap";
import {
	SKIP_HINT_ID,
	SKIP_KEYCAP_ID,
	SkipHint,
} from "../src/game/ui/skip-hint";
import { SkipHintState } from "../src/game/ui/skip-hint-state";
import { SkipHintSyncSystem } from "../src/game/ui/skip-hint-system";

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
			getImage: () => ({}),
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

const ringProgress = (
	root: UiRoot,
	dyn: DynStore,
): number | undefined => {
	const node = findById(root.tree, holdRingNodeId(SKIP_KEYCAP_ID));
	expect(node).not.toBeNull();
	return dyn.get(node!.id)?.progress;
};

test("skip hint mounts only while a cutscene is active", () => {
	const ecs = new ECS();
	const hud = new SkipHintState();
	const root = new UiRoot();
	const dyn = new DynStore();
	const system = new SkipHintSyncSystem(
		hud,
		root,
		dyn,
		new LastUsedDevice(),
	);

	root.flushSyncFromReconciler(() =>
		root.mount(createElement(SkipHint, { store: hud })),
	);
	expect(findById(root.tree, SKIP_HINT_ID)).toBeNull();

	ecs.createEntity([new CutsceneComponent()]);
	root.flushSyncFromReconciler(() => system.update(ctxFor(ecs)));
	expect(findById(root.tree, SKIP_HINT_ID)).not.toBeNull();
});

test("hold-ring progress tracks skipHeldTime / SKIP_HOLD_SECONDS", () => {
	const ecs = new ECS();
	const cutscene = new CutsceneComponent();
	ecs.createEntity([cutscene]);

	const hud = new SkipHintState();
	const root = new UiRoot();
	const dyn = new DynStore();
	const system = new SkipHintSyncSystem(
		hud,
		root,
		dyn,
		new LastUsedDevice(),
	);

	root.flushSyncFromReconciler(() =>
		root.mount(createElement(SkipHint, { store: hud })),
	);
	root.flushSyncFromReconciler(() => system.update(ctxFor(ecs)));

	cutscene.skipHeldTime = 0;
	system.update(ctxFor(ecs));
	expect(ringProgress(root, dyn)).toBeCloseTo(0);

	cutscene.skipHeldTime = SKIP_HOLD_SECONDS * 0.5;
	system.update(ctxFor(ecs));
	expect(ringProgress(root, dyn)).toBeCloseTo(0.5);

	cutscene.skipHeldTime = SKIP_HOLD_SECONDS;
	system.update(ctxFor(ecs));
	expect(ringProgress(root, dyn)).toBeCloseTo(1);

	cutscene.skipHeldTime = SKIP_HOLD_SECONDS * 2;
	system.update(ctxFor(ecs));
	expect(ringProgress(root, dyn)).toBeCloseTo(1);
});
