import { describe, expect, test } from "bun:test";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import {
	isExclusiveSequenceRunning,
	sequenceDefById,
	startSequence,
} from "../src/engine/sequence/sequence-system";
import { TILE_SIZE } from "../src/engine/tilemap/tile";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import {
	PICKUP_TYPES,
	PickupComponent,
} from "../src/game/pickup/pickup-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { QuestComponent } from "../src/game/quest/quest-component";
import { QuestMarkerTagComponent } from "../src/game/quest/quest-marker-tag-component";
import { campfireStargazerSequence } from "../src/game/sequence/campfire-stargazer-sequence";
import {
	PICKUP_TOUR_QUEST,
	PICKUP_TOUR_TAG,
	pickupTourSequence,
} from "../src/game/sequence/pickup-tour-sequence";
import type { World } from "../src/engine/world";
import type { EntityId } from "../src/engine/ecs";
import { gameSequenceSceneConfig } from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const QM_X = 200;
const QM_Y = 64;

const seedTour = (world: World): void => {
	world.ecs.createEntity([
		new PlayerInputComponent(),
		new TransformComponent(new Vector2(QM_X - TILE_SIZE, QM_Y)),
	]);
	world.ecs.createEntity([
		new DialogueSourceComponent("pickup_tutor"),
		new TransformComponent(new Vector2(QM_X, QM_Y)),
		new MovementIntentComponent(),
	]);
	for (const type of PICKUP_TYPES) {
		world.ecs.createEntity([
			new PickupComponent(type),
			new TransformComponent(new Vector2(0, 0)),
		]);
	}
	world.ecs.createEntity([new QuestComponent(PICKUP_TOUR_QUEST)]);
};

const EXPECTED_DEST_X = QM_X + 5.5 * TILE_SIZE;

const escortDest = (
	fixture: SequenceFixture,
): { x: number; y: number } => {
	const component = fixture.ecs.query(SequenceComponent)[0]?.[1];
	const memory = component?.run.memory["pt.escort"] as
		| { dest?: { x: number; y: number } }
		| undefined;
	if (!memory?.dest) {
		throw new Error("escort step has no pinned destination yet");
	}
	return memory.dest;
};

const quartermasterId = (fixture: SequenceFixture): EntityId =>
	fixture.ecs.query(DialogueSourceComponent)[0]![0];

const quest = (fixture: SequenceFixture): QuestComponent =>
	fixture.ecs.query(QuestComponent)[0]![1];

const markerCount = (fixture: SequenceFixture): number =>
	fixture.ecs.query(QuestMarkerTagComponent).length;

describe("pickup tour (ported) — escort stability + exactly-once", () => {
	test("escort destination stays pinned across a mid-tour save/restore", async () => {
		let skipping = false;
		const fixture = await SequenceFixture.create(
			gameSequenceSceneConfig({
				def: pickupTourSequence,
				seedScene: seedTour,
				skipHeld: () => skipping,
			}),
		);

		fixture.step(1);
		expect(escortDest(fixture).x).toBeCloseTo(EXPECTED_DEST_X);
		expect(escortDest(fixture).y).toBeCloseTo(QM_Y);

		expect(quest(fixture).goals[PICKUP_TOUR_TAG]).toBe(4);
		expect(markerCount(fixture)).toBe(4);

		fixture.ecs.getComponent(
			quartermasterId(fixture),
			TransformComponent,
		)!.position.x = 400;

		await fixture.saveAndReload();
		fixture.step(1);

		expect(escortDest(fixture).x).toBeCloseTo(EXPECTED_DEST_X);
		expect(quest(fixture).goals[PICKUP_TOUR_TAG]).toBe(4);
		expect(markerCount(fixture)).toBe(4);

		skipping = true;
		fixture.step(60);
		expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
		const qmX = fixture.ecs.getComponent(
			quartermasterId(fixture),
			TransformComponent,
		)!.position.x;
		expect(qmX).toBeCloseTo(EXPECTED_DEST_X);
		fixture.dispose();
	});
});

describe("Ink start_cutscene path — start by def id, queue while active", () => {
	test("a registered def starts by id and a second exclusive enqueues", async () => {
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

		fixture.step(1);
		expect(isExclusiveSequenceRunning(fixture.ecs)).toBe(true);
		const component = fixture.ecs.query(SequenceComponent)[0]![1];
		expect(component.defId).toBe("campfire-stargazer");

		startSequence(fixture.ecs, sequenceDefById("pickup-tour"));
		expect(component.queue).toContain("pickup-tour");
		expect(fixture.ecs.query(SequenceComponent).length).toBe(1);
		fixture.dispose();
	});
});
