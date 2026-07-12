import { expect, test } from "bun:test";
import RAPIER_COMPAT from "@dimforge/rapier2d-compat";
import type * as RAPIER_NS from "@dimforge/rapier2d";
import type { CutsceneScene } from "../src/engine/cutscene/cutscene";
import { CutsceneComponent } from "../src/engine/cutscene/cutscene-component";
import {
	CutsceneSystem,
	registerCutscene,
	startCutscene,
} from "../src/engine/cutscene/cutscene-system";
import { step } from "../src/engine/cutscene/verbs";
import { DialogueComponent } from "../src/engine/dialogue/dialogue-component";
import type { ECS } from "../src/engine/ecs";
import { loadRapier } from "../src/engine/physics/rapier-physics";
import {
	serializable,
	serialize,
} from "../src/engine/serialization/serializable";
import { deserializeWorld } from "../src/engine/serialization/deserialize";
import { serializeWorld } from "../src/engine/serialization/serialize";
import type { UpdateContext } from "../src/engine/system";
import { World } from "../src/engine/world";

await RAPIER_COMPAT.init();
await loadRapier(
	async () => RAPIER_COMPAT as unknown as typeof RAPIER_NS,
);

@serializable("TestProbe")
class TestProbeComponent {
	@serialize() effectCount = 0;
	@serialize() open = true;
}

@serializable("TestMarker")
class TestMarkerComponent {}

const LINE = "The cavern opens ahead.";
const CUTSCENE_ID = "test-cutscene";

const probe = (ecs: ECS): TestProbeComponent =>
	ecs.query(TestProbeComponent)[0]![1];

const bump = (ecs: ECS, amount: number): void => {
	probe(ecs).effectCount += amount;
};

const scene: CutsceneScene = function* (api) {
	yield* step(api, "setup", (a) => ({
		setup: () => {
			a.effect((ctx) => bump(ctx.ecs, 1));
			a.spawn("marker", (ctx) =>
				ctx.ecs.createEntity([new TestMarkerComponent()]),
			);
		},
		poll: (_ctx, tick) => tick.elapsed >= 1,
	}));
	yield* step(api, "talk", (a) => ({
		setup: () => {
			a.spawn("dialogue", (ctx) => {
				const dialogue = new DialogueComponent(null);
				dialogue.speaker = "Guide";
				dialogue.text = LINE;
				dialogue.opened = true;
				dialogue.phase = "open";
				return ctx.ecs.createEntity([dialogue]);
			});
		},
		poll: (ctx) => {
			const id = a.ref("dialogue");
			return (
				id === undefined ||
				ctx.ecs.getComponent(id, DialogueComponent) === undefined
			);
		},
	}));
	const open = api.read((ctx) => probe(ctx.ecs).open);
	if (open) {
		yield* step(api, "after-open", (a) => ({
			setup: () => a.effect((ctx) => bump(ctx.ecs, 100)),
			poll: (_ctx, tick) => tick.elapsed >= 1,
		}));
	} else {
		yield* step(api, "after-closed", (a) => ({
			setup: () => a.effect((ctx) => bump(ctx.ecs, 1000)),
			poll: (_ctx, tick) => tick.elapsed >= 1,
		}));
	}
};

const def = { id: CUTSCENE_ID, scenes: [scene] };

const DT = 0.6;

const ctxFor = (world: World): UpdateContext =>
	({
		dt: DT * 1000,
		time: { dt: DT, elapsed: 0, scale: 1 },
		ecs: world.ecs,
		world,
		input: {},
		assetManager: {},
		events: world.events,
		audio: {},
	}) as unknown as UpdateContext;

const system = (): CutsceneSystem =>
	new CutsceneSystem({ skipHeld: () => false });

const cutsceneOf = (world: World): CutsceneComponent =>
	world.ecs.query(CutsceneComponent)[0]![1];

const seed = (world: World, open = true): void => {
	const p = new TestProbeComponent();
	p.open = open;
	world.ecs.createEntity([p]);
};

const roundTrip = (source: World): World => {
	const snapshot = serializeWorld(source.ecs);
	const target = new World({ x: 0, y: 20 });
	deserializeWorld(target, snapshot);
	return target;
};

const dialogueEntities = (world: World): number =>
	world.ecs.query(DialogueComponent).length;

const markerEntities = (world: World): number =>
	world.ecs.query(TestMarkerComponent).length;

const driveUntil = (
	sys: CutsceneSystem,
	world: World,
	predicate: () => boolean,
	max = 50,
): void => {
	for (let i = 0; i < max && !predicate(); i++) {
		sys.update(ctxFor(world));
	}
};

registerCutscene(def);

test("resumes mid-cutscene-dialogue without duplicating effects, spawns, or the dialogue", () => {
	const source = new World({ x: 0, y: 20 });
	seed(source);
	const sourceSys = system();
	startCutscene(source.ecs, def);

	driveUntil(
		sourceSys,
		source,
		() => cutsceneOf(source).sequence.stepId === "talk",
	);

	// Guard: we saved while the embedded dialogue line is on screen.
	expect(cutsceneOf(source).sequence.stepId).toBe("talk");
	expect(dialogueEntities(source)).toBe(1);
	expect(markerEntities(source)).toBe(1);
	expect(probe(source.ecs).effectCount).toBe(1);

	const restored = roundTrip(source);

	// Fails if the standalone dialogue line was lost on save.
	const restoredDialogue =
		restored.ecs.query(DialogueComponent)[0]![1];
	expect(restoredDialogue.text).toBe(LINE);
	expect(restoredDialogue.speaker).toBe("Guide");

	const restoredSys = system();
	restoredSys.update(ctxFor(restored));

	// Fails if seek re-ran a completed step (re-teleport / re-played effect).
	expect(probe(restored.ecs).effectCount).toBe(1);
	// Fails if a completed spawn verb ran its create again on replay.
	expect(markerEntities(restored)).toBe(1);
	// Fails if the embedded dialogue was re-opened on resume.
	expect(dialogueEntities(restored)).toBe(1);
	// Fails if the surrounding sequence did not resume at the saved step.
	expect(cutsceneOf(restored).sequence.stepId).toBe("talk");

	// Closing the dialogue lets the resumed sequence advance past it.
	const dialogueId = restored.ecs.query(DialogueComponent)[0]![0];
	restored.ecs.destroy(dialogueId);
	restored.ecs.flushDestroyed();
	driveUntil(
		restoredSys,
		restored,
		() => cutsceneOf(restored).sequence.stepId === "after-open",
	);

	// Fails if the sequence did not resume driving after the dialogue closed,
	// or if the setup effect re-fired (would be 102 rather than 101).
	expect(cutsceneOf(restored).sequence.stepId).toBe("after-open");
	expect(probe(restored.ecs).effectCount).toBe(101);
	expect(markerEntities(restored)).toBe(1);
});

test("a world-state branch re-evaluates identically across a save at a post-branch step", () => {
	const source = new World({ x: 0, y: 20 });
	seed(source, true);
	const sourceSys = system();
	startCutscene(source.ecs, def);

	driveUntil(
		sourceSys,
		source,
		() => cutsceneOf(source).sequence.stepId === "talk",
	);
	// Close the embedded dialogue so the branch is taken and reached.
	const dialogueId = source.ecs.query(DialogueComponent)[0]![0];
	source.ecs.destroy(dialogueId);
	source.ecs.flushDestroyed();
	driveUntil(
		sourceSys,
		source,
		() => cutsceneOf(source).sequence.stepId === "after-open",
	);
	expect(cutsceneOf(source).sequence.stepId).toBe("after-open");
	const savedCount = probe(source.ecs).effectCount;
	expect(savedCount).toBe(101);

	const restored = roundTrip(source);
	const restoredSys = system();
	restoredSys.update(ctxFor(restored));

	// The branch replays to the SAME step and its effect is not re-fired.
	expect(cutsceneOf(restored).sequence.stepId).toBe("after-open");
	expect(probe(restored.ecs).effectCount).toBe(101);

	// Divergence: flip the branch condition in the restored world; the replay
	// can no longer reach the saved post-branch step and surfaces an error
	// rather than silently taking the wrong path.
	const divergent = roundTrip(source);
	probe(divergent.ecs).open = false;
	const divergentSys = system();
	divergentSys.update(ctxFor(divergent));
	expect(cutsceneOf(divergent) === undefined).toBe(false);
	// The failed seek dropped the scene; the branch step never resumed.
	expect(cutsceneOf(divergent).sequence.stepId).not.toBe(
		"after-open",
	);
});
