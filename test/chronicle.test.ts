import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import { ECS } from "../src/engine/ecs";
import { InkStoryComponent } from "../src/engine/ink/ink-story-component";
import { compileStory } from "../src/engine/ink/story";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { World } from "../src/engine/world";
import { ChronicleComponent } from "../src/game/chronicle/chronicle-component";
import { bindSetChronicle } from "../src/game/chronicle/chronicle-ink-external";
import { ChronicleInkMirrorSystem } from "../src/game/chronicle/chronicle-ink-mirror-system";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

test("mirror pushes chronicle worldview into the ink variablesState", () => {
	const ecs = new ECS();

	const chronicle = new ChronicleComponent();
	chronicle.set("rozenberg", "thief");
	ecs.createEntity([chronicle]);

	const ink = new InkStoryComponent();
	ink.story = compileStory(
		{ "main.ink": 'VAR rozenberg = "unknown"\nHello.\n' },
		"main.ink",
	);
	ecs.createEntity([ink]);

	expect(ink.story.variablesState["rozenberg"]).toBe("unknown");

	new ChronicleInkMirrorSystem().update({
		ecs,
	} as unknown as UpdateContext);

	expect(ink.story.variablesState["rozenberg"]).toBe("thief");
});

test("set_chronicle external writes into the chronicle component", () => {
	const ecs = new ECS();

	const chronicle = new ChronicleComponent();
	ecs.createEntity([chronicle]);

	const story = compileStory(
		{
			"main.ink":
				'EXTERNAL set_chronicle(key, value)\n~ set_chronicle("rozenberg", "murderer")\nDone.\n',
		},
		"main.ink",
	);
	bindSetChronicle(story, ecs);

	while (story.canContinue) {
		story.Continue();
	}

	expect(chronicle.get("rozenberg")).toBe("murderer");
});

test("set_chronicle no-ops safely when no chronicle exists", () => {
	const ecs = new ECS();

	const story = compileStory(
		{
			"main.ink":
				'EXTERNAL set_chronicle(key, value)\n~ set_chronicle("rozenberg", "witness")\nDone.\n',
		},
		"main.ink",
	);
	bindSetChronicle(story, ecs);

	expect(() => {
		while (story.canContinue) {
			story.Continue();
		}
	}).not.toThrow();
});

test("chronicle round-trips through serialize and deserialize", () => {
	const source = new World({ x: 0, y: 20 });

	const chronicle = new ChronicleComponent();
	chronicle.set("rozenberg", "witness");
	chronicle.set("met_elder", "true");
	const chronicleId = source.ecs.createEntity([chronicle]);

	const snapshot = serializeWorld(source.ecs);
	const entity = snapshot.find((e) => e.id === chronicleId);
	expect(entity).toBeDefined();
	expect(entity!.components).toHaveProperty("Chronicle");

	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);

	const restored = target.ecs.getComponent(
		chronicleId,
		ChronicleComponent,
	);
	expect(restored).toBeInstanceOf(ChronicleComponent);
	expect(restored?.get("rozenberg")).toBe("witness");
	expect(restored?.get("met_elder")).toBe("true");
});
