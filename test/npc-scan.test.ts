import { expect, test } from "bun:test";
import { ECS, type EntityId } from "../src/engine/ecs";
import { FacingComponent } from "../src/engine/locomotion/facing-component";
import { FacingSystem } from "../src/engine/locomotion/facing-system";
import { MovementIntentComponent } from "../src/engine/locomotion/movement-intent-component";
import { SequenceComponent } from "../src/engine/sequence/sequence-component";
import type { UpdateContext } from "../src/engine/system";
import { NpcScanComponent } from "../src/game/npc/npc-scan-component";
import { NpcScanSystem } from "../src/game/npc/npc-scan-system";

const FRAME_MS = 1000 / 60;
const DWELL = 0.5;

type Fixture = {
	ecs: ECS;
	npc: EntityId;
	step: (frames?: number) => void;
	facing: () => number;
};

/**
 * The scan system followed by the real {@link FacingSystem}, which is what
 * consumes and clears `intent.faceX` — running them in composition order is the
 * only way to observe whether a scan actually turned the NPC.
 */
const fixture = (): Fixture => {
	const ecs = new ECS();
	const scan = new NpcScanSystem();
	const facing = new FacingSystem();
	const npc = ecs.createEntity([
		new NpcScanComponent(DWELL),
		new MovementIntentComponent(),
		new FacingComponent(1),
	]);
	const ctx = { dt: FRAME_MS, ecs } as unknown as UpdateContext;
	return {
		ecs,
		npc,
		step: (frames = 1) => {
			for (let i = 0; i < frames; i++) {
				scan.update(ctx);
				facing.update(ctx);
			}
		},
		facing: () => ecs.getComponent(npc, FacingComponent)!.dir,
	};
};

const castIn = (ecs: ECS, id: EntityId): void => {
	const sequence = new SequenceComponent();
	sequence.defId = "npc-chat";
	sequence.sequenceClass = "exclusive";
	sequence.run.cast.npc = id;
	ecs.createEntity([sequence]);
};

test("an idle NPC sweeps its facing on the dwell timer", () => {
	const fx = fixture();

	fx.step(10);
	expect(fx.facing()).toBe(1);

	fx.step(Math.round(DWELL * 60));
	expect(fx.facing()).toBe(-1);

	fx.step(Math.round(DWELL * 60));
	expect(fx.facing()).toBe(1);
});

test("scanning stops while the NPC is cast in an exclusive sequence", () => {
	const fx = fixture();

	castIn(fx.ecs, fx.npc);
	fx.step(Math.round(DWELL * 60 * 3));

	expect(fx.facing()).toBe(1);
	expect(
		fx.ecs.getComponent(fx.npc, NpcScanComponent)!.machine.elapsed,
	).toBe(0);
});

test("a conversation's one-off faceX is not overwritten on the next frame", () => {
	const fx = fixture();

	// Sweep to face left, then a conversation starts and turns the NPC right.
	fx.step(Math.round(DWELL * 60) + 1);
	expect(fx.facing()).toBe(-1);

	castIn(fx.ecs, fx.npc);
	fx.ecs.getComponent(fx.npc, MovementIntentComponent)!.faceX = 1;
	fx.step(30);

	expect(fx.facing()).toBe(1);
});

test("a walking NPC is not turned backwards by its scan", () => {
	const fx = fixture();

	fx.ecs.getComponent(fx.npc, MovementIntentComponent)!.moveX = -1;
	fx.step();

	expect(fx.facing()).toBe(-1);

	// The scan machine never advanced, so it resumes where it left off once the
	// NPC stops.
	expect(
		fx.ecs.getComponent(fx.npc, NpcScanComponent)!.machine.elapsed,
	).toBe(0);
});
