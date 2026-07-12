import type AssetManager from "../assets";
import type AudioManager from "../audio/audio";
import type { ECS } from "../ecs";
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
}>;

export type CutsceneScene = (
	api: CutsceneApi,
) => Generator<CutsceneStep, void, void>;

export type CutsceneDef = Readonly<{
	id: string;
	scenes: ReadonlyArray<CutsceneScene>;
}>;
