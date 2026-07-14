import type AssetManager from "../assets";
import type AudioManager from "../audio/audio";
import type { ECS, EntityId, ReadonlyECS } from "../ecs";
import type EventBus from "../events";
import type {
	SequenceApi,
	SequenceTick,
	Step,
} from "../sequence/resumable-sequence";
import type { World } from "../world";

export type CutsceneContext = Readonly<{
	ecs: ECS;
	world: World;
	events: EventBus;
	assetManager: AssetManager;
	audio: AudioManager;
	skip: boolean;
}>;

export type CutsceneApi = SequenceApi<CutsceneContext>;

export type CutsceneStep = Step<CutsceneContext>;

export type CutsceneVerb = Readonly<{
	setup?: () => void;
	poll: (ctx: CutsceneContext, tick: SequenceTick) => boolean;
	complete?: (ctx: CutsceneContext) => boolean;
	skippable?: (ctx: CutsceneContext) => boolean;
}>;

export const MISSING_REQUIRED = "missing-required";

export type CutsceneCast = Readonly<Record<string, EntityId>>;

export type CutsceneScene<C = unknown> = (
	api: CutsceneApi,
	cast: C,
) => Generator<CutsceneStep, void, void>;

export type CutsceneDef<C = unknown> = Readonly<{
	id: string;
	cast?: (ecs: ReadonlyECS) => C | typeof MISSING_REQUIRED;
	scenes: ReadonlyArray<CutsceneScene<C>>;
}>;
