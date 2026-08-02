import type { PartialWeatherChannels } from "../weather/channels";
import type {
	ActorRef,
	BranchNode,
	LeafOpNode,
	OpNode,
	OpParams,
	ParallelNode,
	PointRef,
	PredicateRef,
	SeqNode,
	Vec2,
	WaitNode,
	WaitUntilNode,
} from "./op";
import { walkNodes } from "./op";
import type {
	Cast,
	CastResolverRef,
	SequenceClass,
	SequenceDef,
} from "./sequence-def";

const RESERVED_TYPES: ReadonlySet<string> = new Set([
	"seq",
	"parallel",
	"branch",
	"waitUntil",
	"wait",
]);

const leaf = <P extends OpParams>(
	type: string,
	stepId: string,
	params: P,
): LeafOpNode => ({ kind: "op", type, stepId, params });

const predicate = <P extends OpParams>(
	name: string,
	params: P,
): PredicateRef => ({ predicate: name, params });

export const seq = (
	stepId: string,
	...children: ReadonlyArray<OpNode>
): SeqNode => ({ kind: "seq", stepId, children });

export const parallel = (
	stepId: string,
	...children: ReadonlyArray<OpNode>
): ParallelNode => ({ kind: "parallel", stepId, children });

export const branch = (
	stepId: string,
	cond: PredicateRef,
	whenTrue: OpNode,
	whenFalse: OpNode | null = null,
): BranchNode => ({
	kind: "branch",
	stepId,
	cond,
	whenTrue,
	whenFalse,
});

export const waitUntil = (
	stepId: string,
	cond: PredicateRef,
): WaitUntilNode => ({ kind: "waitUntil", stepId, cond });

export const wait = (stepId: string, seconds: number): WaitNode => ({
	kind: "wait",
	stepId,
	seconds,
});

export const OP_TYPES = {
	dialogue: "dialogue",
	bark: "bark",
	spawn: "spawn",
	despawn: "despawn",
	walkTo: "walkTo",
	moveTo: "moveTo",
	escort: "escort",
	cameraTo: "cameraTo",
	focusOn: "focusOn",
	follow: "follow",
	fade: "fade",
	weatherOverride: "weatherOverride",
	setFlag: "setFlag",
	releaseControl: "releaseControl",
	lockControl: "lockControl",
} as const;

export const PREDICATE_IDS = {
	enemiesDead: "enemiesDead",
	chronicleEquals: "chronicleEquals",
	blackboardEquals: "blackboardEquals",
	reached: "reached",
} as const;

export type SequenceFraming = Readonly<{
	zoom: number;
	mode?: string;
	duration?: number;
	follow?: boolean;
	offsetTiles?: Vec2;
}>;

export type DialogueParams = Readonly<{
	knot?: string;
	knotKey?: string;
	source?: ActorRef;
	capture?: string;
}>;

export const dialogue = (
	stepId: string,
	params: DialogueParams,
): LeafOpNode => leaf(OP_TYPES.dialogue, stepId, params);

export type BarkParams = Readonly<{
	actor: ActorRef;
	knot: string;
	seconds?: number;
}>;

export const bark = (
	stepId: string,
	params: BarkParams,
): LeafOpNode => leaf(OP_TYPES.bark, stepId, params);

export type SpawnParams = Readonly<{
	prefab: string;
	at: Vec2 | ActorRef;
	bind: ActorRef;
	tag?: string;
}>;

export const spawn = (
	stepId: string,
	params: SpawnParams,
): LeafOpNode => leaf(OP_TYPES.spawn, stepId, params);

export type DespawnParams = Readonly<{ actor: ActorRef }>;

export const despawn = (
	stepId: string,
	params: DespawnParams,
): LeafOpNode => leaf(OP_TYPES.despawn, stepId, params);

export type WalkToParams = Readonly<{
	actor: ActorRef;
	x: number;
	speed?: number;
}>;

export const walkTo = (
	stepId: string,
	params: WalkToParams,
): LeafOpNode => leaf(OP_TYPES.walkTo, stepId, params);

export type MoveToParams = Readonly<{
	actor: ActorRef;
	to: Vec2 | ActorRef;
	arriveTolerance?: number;
}>;

export const moveTo = (
	stepId: string,
	params: MoveToParams,
): LeafOpNode => leaf(OP_TYPES.moveTo, stepId, params);

export type EscortParams = Readonly<{
	follower: ActorRef;
	leader: ActorRef;
	to: PointRef;
}>;

export const escort = (
	stepId: string,
	params: EscortParams,
): LeafOpNode => leaf(OP_TYPES.escort, stepId, params);

export type CameraToParams = Readonly<{
	target: Vec2 | ActorRef;
	zoom: number;
	mode?: string;
	duration?: number;
	follow?: boolean;
}>;

/**
 * Move the camera to a point or an actor, optionally tracking it afterwards
 * (`follow: true`). Exclusive sequences only, and camera control is
 * sequence-scoped: whatever the cutscene frames, gameplay gets its follow
 * targets and zoom back when the sequence ends, is skipped, or is destroyed.
 *
 * @example
 * cameraTo("ambush.frame-player", { target: "player", zoom: 3, duration: 1, follow: true })
 */
export const cameraTo = (
	stepId: string,
	params: CameraToParams,
): LeafOpNode => leaf(OP_TYPES.cameraTo, stepId, params);

export type FocusOnParams = Readonly<{
	target: Vec2 | ActorRef;
	framing: SequenceFraming;
}>;

/**
 * {@link cameraTo} with a named framing (zoom, mode, duration, tile offset), and
 * the same sequence-scoped camera ownership.
 *
 * @example
 * focusOn("campfire.settle", { target: "companion", framing: { zoom: 4, duration: 1.5 } })
 */
export const focusOn = (
	stepId: string,
	params: FocusOnParams,
): LeafOpNode => leaf(OP_TYPES.focusOn, stepId, params);

export type FollowParams = Readonly<{
	actors: readonly ActorRef[];
}>;

/**
 * Point the camera's follow at these actors for the rest of the sequence (one
 * actor tracks it, several frame them all). Sequence-scoped like the other
 * camera ops, so it never needs a trailing step to hand the camera back.
 *
 * @example
 * follow("npc-chat.frame", { actors: ["player", "npc"] })
 */
export const follow = (
	stepId: string,
	params: FollowParams,
): LeafOpNode => leaf(OP_TYPES.follow, stepId, params);

export type FadeParams = Readonly<{
	to: number;
	duration: number;
	easing?: string;
}>;

export const fade = (
	stepId: string,
	params: FadeParams,
): LeafOpNode => leaf(OP_TYPES.fade, stepId, params);

export type WeatherOverrideParams = Readonly<{
	/**
	 * Preset whose targets to impose, resolved from the **catalog-wide** preset
	 * table — so it may name a preset the active climate would never roll, which
	 * is the whole point of a director's tool. Omit to adjust only the scalars.
	 */
	presetId?: string;
	/** Wind target `0..1`, winning over `presetId`. */
	wind?: number;
	/**
	 * Per-channel precipitation targets `0..1`, each winning over `presetId`. A
	 * channel left out defers rather than zeroing, so `{ rain: 1 }` makes it pour
	 * without also promising the preset's snow away.
	 */
	precipitation?: PartialWeatherChannels;
	/** Signed base direction `-1..1`, winning over `presetId`. */
	direction?: number;
	/** Highest priority wins among live overrides. Defaults to `0`. */
	priority?: number;
}>;

/**
 * Impose weather targets for as long as this sequence owns them.
 *
 * The step completes the tick it is reached — it arms an override and moves on,
 * rather than blocking — and the override lives until the sequence ends, is
 * skipped, rolls over to a queued def, or is destroyed outright. Because an
 * override supplies *targets* and never values, both arming and releasing it
 * ramp like any other weather transition; consumers only ever read the eased
 * scalars, so there are no hard cuts to author around. Indoor suppression still
 * applies, deliberately: the director gets the storm heard through the walls,
 * not painted inside them.
 *
 * Ambient sequences may use it. Unlike the camera — one resource, no
 * arbitration, hence exclusive-only — overrides are priority-arbitrated, so
 * concurrent claimants have a defined winner rather than a conflict, and an
 * area's ambient loop is exactly where "a storm rolls in here" belongs.
 *
 * @example
 * weatherOverride("ambush.storm", { presetId: "storm", priority: 10 })
 * @example
 * weatherOverride("duel.stillness", { wind: 0, precipitation: { rain: 0 } })
 */
export const weatherOverride = (
	stepId: string,
	params: WeatherOverrideParams,
): LeafOpNode => leaf(OP_TYPES.weatherOverride, stepId, params);

export type SetFlagParams = Readonly<{
	flag: string;
	value: string;
}>;

export const setFlag = (
	stepId: string,
	params: SetFlagParams,
): LeafOpNode => leaf(OP_TYPES.setFlag, stepId, params);

export type ControlParams = Readonly<{
	actor?: ActorRef;
}>;

export const releaseControl = (
	stepId: string,
	params: ControlParams = {},
): LeafOpNode => leaf(OP_TYPES.releaseControl, stepId, params);

export const lockControl = (
	stepId: string,
	params: ControlParams = {},
): LeafOpNode => leaf(OP_TYPES.lockControl, stepId, params);

export type EnemiesDeadParams = Readonly<{ tag: string }>;

export const enemiesDead = (
	params: EnemiesDeadParams,
): PredicateRef => predicate(PREDICATE_IDS.enemiesDead, params);

export type ChronicleEqualsParams = Readonly<{
	flag: string;
	value: string;
}>;

export const chronicleEquals = (
	params: ChronicleEqualsParams,
): PredicateRef => predicate(PREDICATE_IDS.chronicleEquals, params);

export type BlackboardEqualsParams = Readonly<{
	key: string;
	value: string | number;
}>;

export const blackboardEquals = (
	params: BlackboardEqualsParams,
): PredicateRef => predicate(PREDICATE_IDS.blackboardEquals, params);

export type ReachedParams = Readonly<{
	actor: ActorRef;
	x: number;
	tolerance?: number;
}>;

export const reached = (params: ReachedParams): PredicateRef =>
	predicate(PREDICATE_IDS.reached, params);

export const castRole = <P extends OpParams>(
	resolver: string,
	params?: P,
): CastResolverRef =>
	params === undefined ? { resolver } : { resolver, params };

export type SequenceDefInput = Readonly<{
	id: string;
	class: SequenceClass;
	cast: Cast;
	root: OpNode;
}>;

const assertUniqueStepIds = (def: SequenceDefInput): void => {
	const seen = new Set<string>();
	walkNodes(def.root, (node) => {
		if (node.stepId === "") {
			throw new Error(
				`sequence "${def.id}": a ${node.kind} node has an empty stepId; every node must carry a stable authored stepId (rule 2)`,
			);
		}
		if (seen.has(node.stepId)) {
			throw new Error(
				`sequence "${def.id}": duplicate stepId "${node.stepId}"; step ids must be unique so the run-state cursor tree and memory records are unambiguous (rule 2)`,
			);
		}
		seen.add(node.stepId);
	});
};

const assertLeafTypes = (def: SequenceDefInput): void => {
	walkNodes(def.root, (node) => {
		if (node.kind === "op" && RESERVED_TYPES.has(node.type)) {
			throw new Error(
				`sequence "${def.id}": leaf op at step "${node.stepId}" uses reserved structural type "${node.type}"`,
			);
		}
	});
};

export const sequenceDef = (input: SequenceDefInput): SequenceDef => {
	assertUniqueStepIds(input);
	assertLeafTypes(input);
	return input;
};
