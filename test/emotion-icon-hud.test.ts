import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { Glob } from "bun";
import { createElement } from "react";
import AssetManager from "../src/engine/assets";
import { decodePng } from "../src/editor/sprite/png-codec";
import { ECS, type EntityId } from "../src/engine/ecs";
import EventBus from "../src/engine/events";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { PerceptionComponent } from "../src/engine/perception/perception-component";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { TransformComponent } from "../src/engine/transform-component";
import { findById } from "../src/engine/ui/input/node-tree";
import type { UiNode } from "../src/engine/ui/reconciler/ui-node";
import type { UiRuntime } from "../src/engine/ui/ui-runtime";
import Vector2 from "../src/engine/vector2";
import type { World } from "../src/engine/world";
import { CharacterComponent } from "../src/game/character/character-component";
import { PerceptionSystem } from "../src/game/enemy/perception-system";
import { FactionComponent } from "../src/game/faction/faction-component";
import { HealthComponent } from "../src/game/health/health-component";
import { EMOTION_CELLS } from "../src/game/reaction/emotion-icon-atlas";
import {
	EmotionIcons,
	emotionIconNodeId,
} from "../src/game/reaction/emotion-icon-hud";
import { EmotionIconHudState } from "../src/game/reaction/emotion-icon-hud-state";
import { EmotionIconHudSystem } from "../src/game/reaction/emotion-icon-hud-system";
import { EMOTION_ICON_SHEET_URL } from "../src/game/reaction/resolve-emotion-icon";
import { ReactionComponent } from "../src/game/reaction/reaction-component";
import { ReactionSystem } from "../src/game/reaction/reaction-system";
import {
	headlessUi,
	mountSync,
	snapshot,
} from "./support/ui-fixture";

/** Every component, so the world round-trip reconstructs rather than skips. */
for (const path of new Glob(
	"src/{engine,game}/**/*-component.ts",
).scanSync(".")) {
	await import(`../${path.replace(/\\/g, "/")}`);
}

const FRAME_MS = 1000 / 60;
const frames = (seconds: number): number => Math.round(seconds * 60);

/** The icon HUD's clearance above the sprite, as the system uses it. */
const GAP = 22;
const HALF_WIDTH = 8;

const NPC_HOME = new Vector2(40, -12);
const PLAYER_NEAR = new Vector2(104, -12);
const PLAYER_FAR = new Vector2(-800, -12);

/**
 * The atlas on disk. `EMOTION_ICON_SHEET_URL` is whatever the bundler resolved
 * the import to — a served path under Vite, an absolute file path under
 * `bun test` — so the cache key and the disk path are kept separate.
 */
const SHEET_FILE = "/src/game/content/assets/emotions.icons.png";

/** Perception's only world dependency is `raycast`; nothing here occludes. */
const openWorld = (ecs: ECS): World =>
	({ ecs, raycast: () => null }) as unknown as World;

/**
 * A real {@link AssetManager} serving the committed atlas, with only the
 * DOM-bound decode replaced — so the crop the HUD publishes is the crop the
 * shipped sheet actually contains.
 */
const atlasAssets = async (): Promise<AssetManager> => {
	const decoded = decodePng(
		new Uint8Array(
			readFileSync(`${import.meta.dir}/..${SHEET_FILE}`),
		),
	);
	const assetManager = new AssetManager(
		async () =>
			({
				width: decoded.width,
				height: decoded.height,
			}) as unknown as HTMLImageElement,
	);
	assetManager.getImage(EMOTION_ICON_SHEET_URL);
	for (let attempt = 0; attempt < 10; attempt++) {
		if (assetManager.getImage(EMOTION_ICON_SHEET_URL)) {
			return assetManager;
		}
		await Promise.resolve();
	}
	throw new Error(
		`${EMOTION_ICON_SHEET_URL} never finished loading.`,
	);
};

type Fixture = {
	ecs: ECS;
	ui: UiRuntime;
	npcId: EntityId;
	step: (count?: number) => void;
	node: () => UiNode | null;
	phase: () => string;
	movePlayer: (to: Vector2) => void;
	roundTrip: () => Fixture;
};

const build = (
	ecs: ECS,
	ui: UiRuntime,
	store: EmotionIconHudState,
	assetManager: AssetManager,
	npcId: EntityId,
	playerId: EntityId,
): Fixture => {
	const events = new EventBus();
	const perception = new PerceptionSystem();
	const reactions = new ReactionSystem();
	const icons = new EmotionIconHudSystem(store, ui.root, ui.dyn);
	const ctx = {
		dt: FRAME_MS,
		ecs,
		world: openWorld(ecs),
		events,
		assetManager,
	} as unknown as UpdateContext;
	return {
		ecs,
		ui,
		npcId,
		step: (count = 1) => {
			for (let i = 0; i < count; i++) {
				ui.step(snapshot(), 1, 1 / 60, () => {
					perception.update(ctx);
					reactions.update(ctx);
					icons.update(ctx);
				});
				ui.layout(1, 320, 200);
				events.clear();
			}
		},
		node: () => findById(ui.root.tree, emotionIconNodeId(npcId)),
		phase: () =>
			ecs.getComponent(npcId, ReactionComponent)!.machine.current,
		movePlayer: (to) => {
			ecs.getComponent(playerId, TransformComponent)!.position =
				to.clone();
		},
		roundTrip: () => {
			const blob = serializeWorld(ecs);
			const fresh = new ECS();
			deserializeWorld(openWorld(fresh), blob, "round-trip", "throw");
			return build(fresh, ui, store, assetManager, npcId, playerId);
		},
	};
};

/**
 * An NPC that will notice the player on its first perceive, plus the HUD.
 *
 * `bramble` is the warm-standing character whose authored greeting carries the
 * `happy` emotion these crops assert; the player faces back at the NPC because a
 * greeting only fires for someone actually engaging it.
 */
const fixture = async (): Promise<Fixture> => {
	const assetManager = await atlasAssets();
	const ecs = new ECS();
	const npcId = ecs.createEntity([
		new PerceptionComponent(),
		new FactionComponent("folk"),
		new TransformComponent(NPC_HOME.clone()),
		new FacingComponent(1),
		new ReactionComponent("npc"),
		new CharacterComponent("bramble"),
	]);
	const playerId = ecs.createEntity([
		new FactionComponent("player"),
		new TransformComponent(PLAYER_NEAR.clone()),
		new FacingComponent(-1),
		new HealthComponent(),
	]);
	const store = new EmotionIconHudState();
	const ui = headlessUi();
	mountSync(ui, createElement(EmotionIcons, { store }));
	ui.layout(1, 320, 200);
	return build(ecs, ui, store, assetManager, npcId, playerId);
};

const stepUntil = (
	fx: Fixture,
	phase: string,
	budget = 600,
): void => {
	for (let i = 0; i < budget; i++) {
		if (fx.phase() === phase) {
			return;
		}
		fx.step();
	}
	throw new Error(
		`reaction never reached "${phase}"; stuck in "${fx.phase()}"`,
	);
};

test("no icon node exists while the reaction lifecycle is idle", async () => {
	const fx = await fixture();
	fx.movePlayer(PLAYER_FAR);

	fx.step(frames(1));

	expect(fx.phase()).toBe("idle");
	expect(fx.node()).toBeNull();
});

test("an icon node lives for the whole reacting span and unmounts on idle", async () => {
	const fx = await fixture();

	fx.step();
	expect(fx.phase()).toBe("entering");
	expect(fx.node()).not.toBeNull();

	// Present on every frame of every reacting phase, not a one-frame blink.
	for (const phase of ["entering", "holding", "exiting"]) {
		stepUntil(fx, phase);
		for (let i = 0; i < 3 && fx.phase() === phase; i++) {
			expect(fx.node()).not.toBeNull();
			fx.step();
		}
	}

	stepUntil(fx, "idle");
	expect(fx.node()).toBeNull();
});

test("the node carries the authored emotion's crop, anchored above the actor", async () => {
	const fx = await fixture();

	// Two frames: the node mounts on the frame its entry is published, so — as
	// with `QuestMarkers` — the anchor lands on the next one. Until it does the
	// world-layer paint branch skips the node, so nothing is drawn unanchored.
	fx.step(2);
	const node = fx.node()!;
	const image = node.children[0]!;

	expect(image.type).toBe("image");
	expect({
		srcX: image.props.srcX,
		srcY: image.props.srcY,
		srcW: image.props.srcW,
		srcH: image.props.srcH,
	}).toEqual(EMOTION_CELLS.happy);

	// No sprite on this entity, so `entityTop` declines and the system falls
	// back to the transform, still raised by the same clearance.
	expect(fx.ui.dyn.get(node.id)).toMatchObject({
		worldX: NPC_HOME.x - HALF_WIDTH,
		worldY: NPC_HOME.y - GAP,
	});
});

test("the icon survives a whole-world capture and restore mid-reaction", async () => {
	const before = await fixture();

	before.step(frames(0.5));
	expect(before.phase()).toBe("holding");
	expect(before.node()).not.toBeNull();

	const after = before.roundTrip();

	// The store still holds the pre-capture entity, so the node is only proven
	// live once the restored world has published its own frame.
	after.step();
	expect(after.phase()).toBe("holding");
	const node = after.node()!;
	expect(node.children[0]!.props.srcX).toBe(EMOTION_CELLS.happy.srcX);
	expect(after.ui.dyn.get(node.id)).toMatchObject({
		worldY: NPC_HOME.y - GAP,
	});

	stepUntil(after, "idle");
	expect(after.node()).toBeNull();
});
