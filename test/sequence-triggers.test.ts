import { describe, expect, test } from "bun:test";
import { CollisionEvent } from "../src/engine/events";
import { resolveActor } from "../src/engine/sequence/interpreter";
import type { SceneDefinition } from "../src/engine/runtime/runtime";
import { SceneConfig } from "../src/engine/scene/scene";
import { ScreenFadeSystem } from "../src/engine/fade/screen-fade-system";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	currentExclusiveSequence,
	SequenceSystem,
} from "../src/engine/sequence/sequence-system";
import { TransformComponent } from "../src/engine/transform-component";
import { TriggerVolumeComponent } from "../src/engine/trigger/trigger-volume-component";
import { TriggerVolumeSystem } from "../src/engine/trigger/trigger-volume-system";
import type { World } from "../src/engine/world";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { registerPrefab } from "../src/game/prefabs";
import { registerSequenceContent } from "../src/game/sequence/sequence-manifest";
import { SequenceTagComponent } from "../src/game/sequence/sequence-tag-component";
import { SequenceTriggerSystem } from "../src/game/sequence/sequence-trigger-system";
import { chronicleTriggerBindings } from "../src/game/sequence/trigger-bindings";
import { inkStoryComponent } from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const CHECKPOINT_INK = [
	"=== checkpoint ===",
	"= guard",
	"Toll bridge, friend.",
	"-> DONE",
	"= demand",
	"Papers, please.",
	"+ [Bribe] # id: bribe",
	"+ [Refuse] # id: refuse",
	"- -> DONE",
	"= bribe_accept",
	"Move along.",
	"-> DONE",
	"= refuse",
	"I am watching you.",
	"-> DONE",
	"= wave_through",
	"Go on, then.",
	"-> DONE",
	"",
].join("\n");

const seedCheckpointGuard = (world: World): void => {
	world.ecs.createEntity([inkStoryComponent(CHECKPOINT_INK)]);
	world.ecs.createEntity([
		new DialogueSourceComponent("checkpoint.guard"),
		new TransformComponent(),
	]);
};

const transformPrefab = () => ({
	components: {
		Transform: {
			position: { $type: "Vector2", x: 0, y: 0 },
			rotation: { $type: "Angle", radians: 0 },
			scale: { $type: "Vector2", x: 1, y: 1 },
		},
	},
});

type TriggerSceneOptions = Readonly<{
	targetId: string;
	seedScene?: (world: World) => void;
}>;

const triggerSceneConfig = (options: TriggerSceneOptions) => {
	registerSequenceContent();

	const scene: SceneDefinition = {
		config: new SceneConfig(),
		build: (world: World): void => {
			world.ecs.createEntity([
				new PlayerInputComponent(),
				new TransformComponent(),
			]);
			options.seedScene?.(world);
			world.ecs.createEntity([
				new TriggerVolumeComponent(options.targetId),
				new TransformComponent(),
			]);
		},
	};

	return {
		initialScene: "trigger-test",
		seed: (): void => {},
		resolveScene: (): SceneDefinition => scene,
		registerSystems: (world: World): void => {
			world.ecs.addUpdateSystem(
				new TriggerVolumeSystem(chronicleTriggerBindings),
			);
			world.ecs.addUpdateSystem(new SequenceTriggerSystem());
			world.ecs.addUpdateSystem(
				new SequenceSystem({ skipHeld: () => false }),
			);
			world.ecs.addUpdateSystem(new ScreenFadeSystem());
		},
	};
};

const walkIntoVolume = (fixture: SequenceFixture): void => {
	const volume = fixture.ecs.query(TriggerVolumeComponent)[0]![0];
	const player = fixture.ecs.query(PlayerInputComponent)[0]![0];
	fixture.world.events.emit(new CollisionEvent(player, volume));
};

const tagged = (fixture: SequenceFixture, tag: string): number =>
	fixture.ecs
		.query(SequenceTagComponent)
		.filter(([, t]) => t.tag === tag).length;

describe("walk-in trigger volumes start their sequence", () => {
	test("checkpoint-bridge starts and resolves the guard cast", async () => {
		const fixture = await SequenceFixture.create(
			triggerSceneConfig({
				targetId: "checkpoint-bridge",
				seedScene: seedCheckpointGuard,
			}),
		);

		expect(currentExclusiveSequence(fixture.ecs)).toBeUndefined();
		walkIntoVolume(fixture);
		fixture.step(1);

		const seqc = currentExclusiveSequence(fixture.ecs);
		expect(seqc?.defId).toBe("checkpoint-bridge");
		expect(resolveActor(seqc!.run, "guard")).not.toBeNull();
		fixture.dispose();
	});

	test("ambush-drill starts and spawns the tagged raiders", async () => {
		registerPrefab("enemy", transformPrefab());
		const fixture = await SequenceFixture.create(
			triggerSceneConfig({ targetId: "ambush-drill" }),
		);

		walkIntoVolume(fixture);
		fixture.step(1);

		expect(currentExclusiveSequence(fixture.ecs)?.defId).toBe(
			"ambush-drill",
		);
		expect(tagged(fixture, "ambush")).toBe(2);
		fixture.dispose();
	});

	test("lost-critter-found starts as an ambient sequence and spawns the critter", async () => {
		registerPrefab("critter", transformPrefab());
		const fixture = await SequenceFixture.create(
			triggerSceneConfig({ targetId: "lost-critter-found" }),
		);

		walkIntoVolume(fixture);
		fixture.step(1);

		expect(tagged(fixture, "lost-critter")).toBe(1);
		fixture.dispose();
	});

	test("a one-shot volume only starts the sequence once", async () => {
		const fixture = await SequenceFixture.create(
			triggerSceneConfig({
				targetId: "checkpoint-bridge",
				seedScene: seedCheckpointGuard,
			}),
		);

		walkIntoVolume(fixture);
		fixture.step(1);
		walkIntoVolume(fixture);
		fixture.step(1);

		expect(fixture.ecs.query(SequenceComponent).length).toBe(1);
		fixture.dispose();
	});
});
