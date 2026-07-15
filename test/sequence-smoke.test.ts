import { describe, expect, test } from "bun:test";
import { ChronicleComponent } from "../src/game/chronicle/chronicle-component";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	isExclusiveSequenceActive,
	isExclusiveSequenceRunning,
} from "../src/engine/sequence/sequence-system";
import { SequenceTagComponent } from "../src/game/sequence/sequence-tag-component";
import { TransformComponent } from "../src/engine/transform-component";
import { registerPrefab } from "../src/game/prefabs";
import { ambushDrillSequence } from "../src/game/sequence/ambush-drill-sequence";
import { campfireStargazerSequence } from "../src/game/sequence/campfire-stargazer-sequence";
import { checkpointBridgeSequence } from "../src/game/sequence/checkpoint-bridge-sequence";
import {
	lostCritterFoundSequence,
	lostCritterHomeSequence,
} from "../src/game/sequence/lost-critter-sequence";
import {
	gameSequenceSceneConfig,
	inkStoryComponent,
	rehydrateInkStory,
} from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const transformPrefab = () => ({
	components: {
		Transform: {
			position: { $type: "Vector2", x: 0, y: 0 },
			rotation: { $type: "Angle", radians: 0 },
			scale: { $type: "Vector2", x: 1, y: 1 },
		},
	},
});

const seq = (
	fixture: SequenceFixture,
): SequenceComponent | undefined =>
	fixture.ecs.query(SequenceComponent)[0]?.[1];

const tagged = (fixture: SequenceFixture, tag: string): number =>
	fixture.ecs
		.query(SequenceTagComponent)
		.filter(([, t]) => t.tag === tag).length;

const chronicle = (
	fixture: SequenceFixture,
	flag: string,
): string | undefined =>
	fixture.ecs.query(ChronicleComponent)[0]?.[1].get(flag);

describe("demo sequence smoke tests", () => {
	test("campfire (long linear) runs to completion", async () => {
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: campfireStargazerSequence,
				seedScene: (world) => {
					world.ecs.createEntity([
						new PlayerInputComponent(),
						new TransformComponent(),
					]);
					world.ecs.createEntity([
						new DialogueSourceComponent("campfire.companion"),
						new TransformComponent(),
					]);
				},
			}),
		);

		fixture.step(200);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("ambush (parallel + control-release) survives a mid-run save", async () => {
		registerPrefab("enemy", transformPrefab());
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: ambushDrillSequence,
				seedScene: (world) => {
					world.ecs.createEntity([
						new PlayerInputComponent(),
						new TransformComponent(),
					]);
				},
			}),
		);

		fixture.step(1);
		expect(tagged(fixture, "ambush")).toBe(2);
		expect(seq(fixture)!.run.controlReleased).toBe(true);
		expect(isExclusiveSequenceRunning(fixture.ecs)).toBe(true);
		expect(isExclusiveSequenceActive(fixture.ecs)).toBe(false);

		await fixture.saveAndReload();

		expect(tagged(fixture, "ambush")).toBe(2);
		expect(seq(fixture)!.run.controlReleased).toBe(true);
		fixture.step(1);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(1);

		for (const [id] of fixture.ecs.query(SequenceTagComponent)) {
			fixture.ecs.destroy(id);
		}
		fixture.step(3);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});

	test("checkpoint (branch) survives a mid-run save", async () => {
		const ink = [
			"=== checkpoint ===",
			"= demand",
			"Papers, please.",
			"+ [Offer a bribe]",
			"+ [Refuse]",
			"- -> DONE",
			"= bribe_accept",
			"Very well. Move along.",
			"-> DONE",
			"= refuse",
			"Hmph. I am watching you.",
			"-> DONE",
			"= wave_through",
			"Go on, then.",
			"-> DONE",
			"",
		].join("\n");
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: checkpointBridgeSequence,
				seedScene: (world) => {
					world.ecs.createEntity([inkStoryComponent(ink)]);
					world.ecs.createEntity([
						new PlayerInputComponent(),
						new TransformComponent(),
					]);
					world.ecs.createEntity([
						new DialogueSourceComponent("checkpoint.guard"),
						new TransformComponent(),
					]);
				},
			}),
		);

		let saved = false;
		let guard = 0;
		while (
			fixture.ecs.query(SequenceComponent).length > 0 &&
			guard++ < 120
		) {
			fixture.step(1);
			const dialogue = fixture.ecs.query(DialogueComponent)[0];
			if (!dialogue) {
				continue;
			}
			if (!saved) {
				await fixture.saveAndReload();
				rehydrateInkStory(fixture.ecs, ink);
				saved = true;
				continue;
			}
			fixture.ecs.destroy(dialogue[0]);
		}

		expect(saved).toBe(true);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		expect(chronicle(fixture, "faction.guards")).toBe("wary");
		fixture.dispose();
	});

	test("lost critter (ambient, two parts) shares chronicle + persists spawn", async () => {
		registerPrefab("critter", transformPrefab());
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: lostCritterFoundSequence,
				seedScene: (world) => {
					world.ecs.createEntity([
						new PlayerInputComponent(),
						new TransformComponent(),
					]);
				},
			}),
		);

		fixture.step(1);
		expect(tagged(fixture, "lost-critter")).toBe(1);
		expect(chronicle(fixture, "critter.state")).toBe("found");
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);

		await fixture.saveAndReload();
		expect(tagged(fixture, "lost-critter")).toBe(1);
		expect(chronicle(fixture, "critter.state")).toBe("found");

		fixture.ecs.createEntity([
			new SequenceComponent(lostCritterHomeSequence),
		]);
		fixture.step(3);
		expect(chronicle(fixture, "critter.state")).toBe("home");
		expect(tagged(fixture, "lost-critter")).toBe(0);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		fixture.dispose();
	});
});
