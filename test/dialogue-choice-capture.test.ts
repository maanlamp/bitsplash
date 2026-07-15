import { describe, expect, test } from "bun:test";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import { TransformComponent } from "../src/engine/transform-component";
import { ChronicleComponent } from "../src/game/chronicle/chronicle-component";
import { DialogueSourceComponent } from "../src/game/dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../src/game/player/player-input-component";
import { checkpointBridgeSequence } from "../src/game/sequence/checkpoint-bridge-sequence";
import {
	gameSequenceSceneConfig,
	inkStoryComponent,
	rehydrateInkStory,
} from "./support/game-sequence-scene";
import { SequenceFixture } from "./support/sequence-harness";

const CHECKPOINT_INK = [
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

const chronicle = (
	fixture: SequenceFixture,
	flag: string,
): string | undefined =>
	fixture.ecs.query(ChronicleComponent)[0]?.[1].get(flag);

const runCheckpoint = async (
	selected: number,
): Promise<SequenceFixture> => {
	const fixture = await SequenceFixture.create(
		gameSequenceSceneConfig({
			def: checkpointBridgeSequence,
			seedScene: (world) => {
				world.ecs.createEntity([inkStoryComponent(CHECKPOINT_INK)]);
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

	let injected = false;
	let saved = false;
	let guard = 0;
	while (
		fixture.ecs.query(SequenceComponent).length > 0 &&
		guard++ < 300
	) {
		fixture.step(1);
		const entry = fixture.ecs.query(DialogueComponent)[0];
		if (!entry) {
			continue;
		}
		const [, state] = entry;
		if (!injected) {
			state.choices = ["Offer a bribe", "Refuse"];
			state.choiceTags = [["id: bribe"], ["id: refuse"]];
			state.selectedOption = selected;
			injected = true;
			fixture.step(1);
			if (!saved) {
				await fixture.saveAndReload();
				rehydrateInkStory(fixture.ecs, CHECKPOINT_INK);
				saved = true;
			}
		}
		const open = fixture.ecs.query(DialogueComponent)[0];
		if (open) {
			fixture.ecs.destroy(open[0]);
		}
	}
	expect(injected).toBe(true);
	expect(saved).toBe(true);
	expect(fixture.ecs.query(SequenceComponent).length).toBe(0);
	return fixture;
};

describe("dialogue choice capture — semantic label", () => {
	test("selecting the bribe choice reaches the bribed branch", async () => {
		const fixture = await runCheckpoint(0);
		expect(chronicle(fixture, "faction.guards")).toBe("bought");
		fixture.dispose();
	});

	test("selecting refuse reaches the refused branch", async () => {
		const fixture = await runCheckpoint(1);
		expect(chronicle(fixture, "faction.guards")).toBe("wary");
		fixture.dispose();
	});
});
