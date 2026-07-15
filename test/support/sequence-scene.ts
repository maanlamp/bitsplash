import type { SceneDefinition } from "../../src/engine/runtime/runtime";
import { SceneConfig } from "../../src/engine/scene/scene";
import { ScreenFadeSystem } from "../../src/engine/fade/screen-fade-system";
import { registerEngineSequenceOps } from "../../src/engine/sequence/engine-ops";
import type {
	LeafOpNode,
	OpParams,
} from "../../src/engine/sequence/op";
import type { OpContext } from "../../src/engine/sequence/op-registry";
import { registerOpType } from "../../src/engine/sequence/op-registry";
import { SequenceComponent } from "../../src/engine/sequence/sequence-component";
import {
	registerSequenceDef,
	SequenceSystem,
} from "../../src/engine/sequence/sequence-system";
import type { SequenceDef } from "../../src/engine/sequence/sequence-def";
import {
	serializable,
	serialize,
} from "../../src/engine/serialization/serializable";
import type { World } from "../../src/engine/world";

@serializable("SequenceProbe")
export class SequenceProbeComponent {
	@serialize() counts: Record<string, number> = {};
}

const bump = (ctx: OpContext, counter: string): void => {
	const entry = ctx.ecs.query(SequenceProbeComponent)[0];
	if (!entry) {
		return;
	}
	const counts = entry[1].counts;
	counts[counter] = (counts[counter] ?? 0) + 1;
};

export const TEST_OP = {
	hold: "test.hold",
	mark: "test.mark",
	setBlackboard: "test.setBlackboard",
} as const;

export const testOp = (
	type: string,
	stepId: string,
	params: OpParams,
): LeafOpNode => ({ kind: "op", type, stepId, params });

let opsRegistered = false;

export const registerTestSequenceOps = (): void => {
	if (opsRegistered) {
		return;
	}
	opsRegistered = true;
	registerEngineSequenceOps();

	registerOpType(TEST_OP.hold, {
		arm(ctx, params, memory) {
			if (memory.fired === true) {
				return;
			}
			bump(ctx, params.counter as string);
			memory.fired = true;
		},
		poll(_ctx, params, memory) {
			const ticks = ((memory.ticks as number) ?? 0) + 1;
			memory.ticks = ticks;
			return ticks >= (params.frames as number);
		},
		skip(ctx, params, memory) {
			if (memory.fired !== true) {
				bump(ctx, params.counter as string);
				memory.fired = true;
			}
		},
	});

	registerOpType(TEST_OP.mark, {
		arm(ctx, params, memory) {
			if (memory.fired === true) {
				return;
			}
			bump(ctx, params.counter as string);
			memory.fired = true;
		},
		poll() {
			return true;
		},
		skip(ctx, params, memory) {
			if (memory.fired !== true) {
				bump(ctx, params.counter as string);
				memory.fired = true;
			}
		},
	});

	registerOpType(TEST_OP.setBlackboard, {
		arm(ctx, params) {
			ctx.run.blackboard[params.key as string] = params.value as
				| string
				| number;
		},
		poll() {
			return true;
		},
		skip(ctx, params) {
			ctx.run.blackboard[params.key as string] = params.value as
				| string
				| number;
		},
	});
};

const SCENE_ID = "sequence-test";

export type SequenceSceneOptions = Readonly<{
	skipHeld?: () => boolean;
}>;

export const sequenceSceneConfig = (
	def: SequenceDef,
	options: SequenceSceneOptions = {},
) => {
	registerTestSequenceOps();
	registerSequenceDef(def);

	const scene: SceneDefinition = {
		config: new SceneConfig(),
		build: (world: World): void => {
			world.ecs.createEntity([new SequenceProbeComponent()]);
			world.ecs.createEntity([new SequenceComponent(def)]);
		},
	};

	return {
		initialScene: SCENE_ID,
		seed: (): void => {},
		resolveScene: (): SceneDefinition => scene,
		registerSystems: (world: World): void => {
			world.ecs.addUpdateSystem(
				new SequenceSystem({
					skipHeld: () => options.skipHeld?.() ?? false,
				}),
			);
			world.ecs.addUpdateSystem(new ScreenFadeSystem());
		},
	};
};
