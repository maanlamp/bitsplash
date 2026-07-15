import type { Story } from "inkjs/full";
import { Duration } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import { mirrorInkState } from "../../engine/ink/story";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { DialogueClosedEvent } from "../../engine/dialogue/events";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { resolveActor } from "../../engine/sequence/interpreter";
import type {
	ActorRef,
	OpParams,
	PointRef,
	Vec2,
} from "../../engine/sequence/op";
import type {
	OpContext,
	OpExecutor,
	OpMemory,
} from "../../engine/sequence/op-registry";
import {
	registerCastResolver,
	registerOpType,
	registerPredicate,
} from "../../engine/sequence/op-registry";
import {
	OP_TYPES,
	PREDICATE_IDS,
} from "../../engine/sequence/builder";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { ChronicleComponent } from "../chronicle/chronicle-component";
import { BarkComponent } from "../dialogue/bark-component";
import { DialoguePanelComponent } from "../dialogue/dialogue-panel-component";
import { fontForTag } from "../dialogue/ink-fonts";
import { panelForTag } from "../dialogue/ink-panels";
import { ensureStory } from "../dialogue/ink-bindings";
import { tagValue } from "../dialogue/ink-tags";
import { FollowComponent } from "../follow/follow-component";
import { HealthComponent } from "../health/health-component";
import { PickupComponent } from "../pickup/pickup-component";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { spawnPrefab } from "../prefabs";
import { SequenceTagComponent } from "./sequence-tag-component";

const ARRIVE_TOLERANCE = 4;
const WALK_STUCK_SECONDS = 2;
const DEFAULT_WALK_SPEED = 2 * TILE_SIZE;

type NavAttach = Readonly<{
	agent: NavAgentComponent;
	addedAgent: boolean;
	addedIntent: boolean;
}>;

const ensureNavActuation = (
	ecs: ECS,
	entity: EntityId,
): NavAttach => {
	let addedIntent = false;
	if (!ecs.getComponent(entity, MovementIntentComponent)) {
		ecs.addComponent(entity, new MovementIntentComponent());
		addedIntent = true;
	}
	let addedAgent = false;
	let agent = ecs.getComponent(entity, NavAgentComponent);
	if (!agent) {
		agent = new NavAgentComponent();
		const player = ecs.getComponent(entity, PlayerInputComponent);
		if (player) {
			agent.jumpSpeed = player.maxJumpSpeed;
			agent.moveSpeed = player.maxSpeed;
		}
		ecs.addComponent(entity, agent);
		addedAgent = true;
	}
	return { agent, addedAgent, addedIntent };
};

const teleportX = (ecs: ECS, entity: EntityId, x: number): void => {
	const transform = ecs.getComponent(entity, TransformComponent);
	const body = ecs.getComponent(entity, PhysicsBodyComponent);
	ecs.getComponent(entity, MovementIntentComponent)?.clear();
	if (!transform) {
		return;
	}
	transform.position.x = x;
	if (body?.body) {
		body.body.setTransform(transform.position, 0);
		body.linearVelocity = new Vector2(0, body.linearVelocity.y);
	}
};

const walkDrive = (
	ctx: OpContext,
	entity: EntityId,
	x: number,
	speed: number,
	mem: OpMemory,
): boolean => {
	const ecs = ctx.ecs;
	const transform = ecs.getComponent(entity, TransformComponent);
	const intent = ecs.getComponent(entity, MovementIntentComponent);
	const body = ecs.getComponent(entity, PhysicsBodyComponent);
	if (!transform) {
		return true;
	}
	const dx = x - transform.position.x;
	if (Math.abs(dx) <= ARRIVE_TOLERANCE) {
		if (intent) {
			intent.moveX = 0;
		} else if (body?.body) {
			body.linearVelocity = new Vector2(0, body.linearVelocity.y);
		}
		return true;
	}
	if (!intent && !body?.body) {
		teleportX(ecs, entity, x);
		return true;
	}
	const lastX = mem.walkLastX as number | undefined;
	let stalled = (mem.walkStalled as number | undefined) ?? 0;
	if (
		lastX !== undefined &&
		Math.abs(transform.position.x - lastX) < 0.5
	) {
		stalled += ctx.dt;
	} else {
		stalled = 0;
	}
	mem.walkLastX = transform.position.x;
	mem.walkStalled = stalled;
	if (stalled >= WALK_STUCK_SECONDS) {
		teleportX(ecs, entity, x);
		return true;
	}
	const dir = Math.sign(dx);
	if (intent) {
		intent.moveX = dir;
	} else if (body?.body) {
		body.linearVelocity = new Vector2(
			dir * speed,
			body.linearVelocity.y,
		);
	}
	return false;
};

const resolvePoint = (
	ctx: OpContext,
	target: Vec2 | ActorRef,
): Vector2 | null => {
	if (typeof target === "string") {
		const entity = resolveActor(ctx.run, target);
		const transform = entity
			? ctx.ecs.getComponent(entity, TransformComponent)
			: undefined;
		return transform ? transform.position.clone() : null;
	}
	return new Vector2(target.x, target.y);
};

const resolvePointRef = (
	ctx: OpContext,
	ref: PointRef,
): Vector2 | null => {
	if ("relTo" in ref) {
		const entity = resolveActor(ctx.run, ref.relTo);
		const transform = entity
			? ctx.ecs.getComponent(entity, TransformComponent)
			: undefined;
		if (!transform) {
			return null;
		}
		return new Vector2(
			transform.position.x + (ref.dx ?? 0),
			transform.position.y + (ref.dy ?? 0),
		);
	}
	return new Vector2(ref.x, ref.y);
};

const pinnedPoint = (
	ctx: OpContext,
	ref: PointRef,
	memory: OpMemory,
): Vector2 | null => {
	const existing = memory.dest as
		| Readonly<{ x: number; y: number }>
		| undefined;
	if (existing) {
		return new Vector2(existing.x, existing.y);
	}
	const resolved = resolvePointRef(ctx, ref);
	if (resolved) {
		memory.dest = { x: resolved.x, y: resolved.y };
	}
	return resolved;
};

const requireActor = (
	ctx: OpContext,
	ref: ActorRef,
	op: string,
): EntityId => {
	const entity = resolveActor(ctx.run, ref);
	if (!entity) {
		throw new Error(
			`sequence op "${op}" could not resolve actor "${ref}"`,
		);
	}
	return entity;
};

const walkToExecutor: OpExecutor = {
	arm() {},
	poll(ctx, params, memory) {
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (!actor) {
			return true;
		}
		const speed =
			(params.speed as number | undefined) ?? DEFAULT_WALK_SPEED;
		return walkDrive(ctx, actor, params.x as number, speed, memory);
	},
	skip(ctx, params) {
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (actor) {
			teleportX(ctx.ecs, actor, params.x as number);
		}
	},
};

const moveToCleanup = (
	ctx: OpContext,
	entity: EntityId,
	memory: OpMemory,
): void => {
	const ecs = ctx.ecs;
	const agent = ecs.getComponent(entity, NavAgentComponent);
	if (agent) {
		agent.target = null;
		agent.status = "idle";
		agent.path = [];
	}
	ecs.getComponent(entity, MovementIntentComponent)?.clear();
	if (memory.addedAgent === true) {
		ecs.removeComponent(entity, NavAgentComponent);
	}
	if (memory.addedIntent === true) {
		ecs.removeComponent(entity, MovementIntentComponent);
	}
};

const moveToDest = (
	ctx: OpContext,
	params: OpParams,
): Vector2 | null => resolvePoint(ctx, params.to as Vec2 | ActorRef);

const moveToTarget = (
	ctx: OpContext,
	params: OpParams,
): Vector2 | EntityId | null => {
	const to = params.to as Vec2 | ActorRef;
	if (typeof to === "string") {
		return resolveActor(ctx.run, to);
	}
	return new Vector2(to.x, to.y);
};

const moveToExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		const actor = requireActor(
			ctx,
			params.actor as ActorRef,
			"moveTo",
		);
		if (memory.mode === undefined) {
			const transform = ctx.ecs.getComponent(
				actor,
				TransformComponent,
			);
			const body = ctx.ecs.getComponent(actor, PhysicsBodyComponent);
			memory.mode = transform && body?.body ? "nav" : "walk";
		}
		if (memory.mode !== "nav") {
			return;
		}
		if (memory.armed !== true) {
			const attach = ensureNavActuation(ctx.ecs, actor);
			memory.addedAgent = attach.addedAgent;
			memory.addedIntent = attach.addedIntent;
			const tolerance = params.arriveTolerance as number | undefined;
			if (tolerance !== undefined) {
				attach.agent.arriveTolerance = tolerance;
			}
			memory.armed = true;
		}
		const agent = ctx.ecs.getComponent(actor, NavAgentComponent);
		const target = moveToTarget(ctx, params);
		if (agent && agent.target === null && target !== null) {
			agent.target = target;
			agent.status = "idle";
			agent.path = [];
		}
	},
	poll(ctx, params, memory) {
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (!actor) {
			return true;
		}
		if (memory.mode !== "nav") {
			const dest = moveToDest(ctx, params);
			if (!dest) {
				return true;
			}
			return walkDrive(
				ctx,
				actor,
				dest.x,
				DEFAULT_WALK_SPEED,
				memory,
			);
		}
		const agent = ctx.ecs.getComponent(actor, NavAgentComponent);
		if (!agent) {
			return true;
		}
		if (agent.status === "arrived") {
			moveToCleanup(ctx, actor, memory);
			return true;
		}
		if (agent.status === "unreachable") {
			const dest = moveToDest(ctx, params);
			if (dest) {
				teleportX(ctx.ecs, actor, dest.x);
			}
			moveToCleanup(ctx, actor, memory);
			return true;
		}
		if (agent.target === null) {
			const target = moveToTarget(ctx, params);
			if (target !== null) {
				agent.target = target;
				agent.status = "idle";
				agent.path = [];
			}
		}
		return false;
	},
	skip(ctx, params, memory) {
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (!actor) {
			return;
		}
		const dest = moveToDest(ctx, params);
		if (dest) {
			teleportX(ctx.ecs, actor, dest.x);
		}
		if (memory.mode === "nav") {
			moveToCleanup(ctx, actor, memory);
		}
	},
};

const escortCleanup = (
	ctx: OpContext,
	follower: EntityId,
	memory: OpMemory,
): void => {
	const ecs = ctx.ecs;
	const agent = ecs.getComponent(follower, NavAgentComponent);
	if (agent) {
		agent.target = null;
		agent.status = "idle";
		agent.path = [];
	}
	ecs.getComponent(follower, MovementIntentComponent)?.clear();
	const follow = ecs.getComponent(follower, FollowComponent);
	if (memory.addedFollow === true) {
		ecs.removeComponent(follower, FollowComponent);
	} else if (follow) {
		follow.leader = null;
		follow.leaderRef.set(null);
	}
	if (memory.addedAgent === true) {
		ecs.removeComponent(follower, NavAgentComponent);
	}
	if (memory.addedIntent === true) {
		ecs.removeComponent(follower, MovementIntentComponent);
	}
};

const escortCloseEnough = (
	ctx: OpContext,
	follower: EntityId,
	leader: EntityId,
): boolean => {
	const ecs = ctx.ecs;
	const follow = ecs.getComponent(follower, FollowComponent);
	const fp = ecs.getComponent(follower, TransformComponent);
	const lp = ecs.getComponent(leader, TransformComponent);
	return (
		!!follow &&
		!!fp &&
		!!lp &&
		fp.position.distanceTo(lp.position) <=
			follow.followDistance + ARRIVE_TOLERANCE
	);
};

const escortExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		const follower = requireActor(
			ctx,
			params.follower as ActorRef,
			"escort",
		);
		const leader = requireActor(
			ctx,
			params.leader as ActorRef,
			"escort",
		);
		pinnedPoint(ctx, params.to as PointRef, memory);
		if (memory.armed !== true) {
			const attach = ensureNavActuation(ctx.ecs, follower);
			attach.agent.target = null;
			attach.agent.status = "idle";
			attach.agent.path = [];
			memory.addedAgent = attach.addedAgent;
			memory.addedIntent = attach.addedIntent;
			let follow = ctx.ecs.getComponent(follower, FollowComponent);
			let addedFollow = false;
			if (!follow) {
				follow = new FollowComponent();
				ctx.ecs.addComponent(follower, follow);
				addedFollow = true;
			}
			follow.leader = leader;
			follow.leaderRef.set(leader);
			memory.addedFollow = addedFollow;
			memory.armed = true;
			return;
		}
		const follow = ctx.ecs.getComponent(follower, FollowComponent);
		if (follow && follow.resolvedLeader() !== leader) {
			follow.leader = leader;
			follow.leaderRef.set(leader);
		}
	},
	poll(ctx, params, memory) {
		const follower = resolveActor(
			ctx.run,
			params.follower as ActorRef,
		);
		const leader = resolveActor(ctx.run, params.leader as ActorRef);
		if (!follower || !leader) {
			return true;
		}
		const dest = pinnedPoint(ctx, params.to as PointRef, memory);
		if (!dest) {
			return true;
		}
		if (memory.leaderDone !== true) {
			memory.leaderDone = walkDrive(
				ctx,
				leader,
				dest.x,
				DEFAULT_WALK_SPEED,
				memory,
			);
		}
		if (
			memory.leaderDone === true &&
			escortCloseEnough(ctx, follower, leader)
		) {
			escortCleanup(ctx, follower, memory);
			return true;
		}
		return false;
	},
	skip(ctx, params, memory) {
		const follower = resolveActor(
			ctx.run,
			params.follower as ActorRef,
		);
		const leader = resolveActor(ctx.run, params.leader as ActorRef);
		if (!follower || !leader) {
			return;
		}
		const dest = pinnedPoint(ctx, params.to as PointRef, memory);
		if (!dest) {
			escortCleanup(ctx, follower, memory);
			return;
		}
		teleportX(ctx.ecs, leader, dest.x);
		const lp = ctx.ecs.getComponent(leader, TransformComponent);
		const fp = ctx.ecs.getComponent(follower, TransformComponent);
		const body = ctx.ecs.getComponent(follower, PhysicsBodyComponent);
		if (lp && fp) {
			fp.position.copy(lp.position);
			if (body?.body) {
				body.body.setTransform(fp.position, 0);
				body.linearVelocity = new Vector2(0, 0);
			}
		}
		escortCleanup(ctx, follower, memory);
	},
};

const spawnExecutor: OpExecutor = {
	arm(ctx, params, _memory) {
		const bind = params.bind as ActorRef;
		if (ctx.run.spawnedRefs[bind] !== undefined) {
			return;
		}
		const pos = resolvePoint(ctx, params.at as Vec2 | ActorRef);
		if (!pos) {
			throw new Error(
				`sequence op "spawn" could not resolve position for "${bind}"`,
			);
		}
		const id = spawnPrefab(ctx.world, params.prefab as string, pos);
		if (id === null) {
			throw new Error(
				`sequence op "spawn": prefab "${params.prefab as string}" is not registered`,
			);
		}
		const tag = params.tag as string | undefined;
		if (tag !== undefined) {
			ctx.ecs.addComponent(id, new SequenceTagComponent(tag));
		}
		ctx.run.spawnedRefs[bind] = id;
	},
	poll() {
		return true;
	},
	skip(ctx, params, memory) {
		spawnExecutor.arm(ctx, params, memory);
	},
};

const despawnExecutor: OpExecutor = {
	arm(ctx, params) {
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (actor && ctx.ecs.getComponent(actor, TransformComponent)) {
			ctx.ecs.destroy(actor);
		}
	},
	poll() {
		return true;
	},
	skip(ctx, params, memory) {
		despawnExecutor.arm(ctx, params, memory);
	},
};

const chronicleOf = (ctx: OpContext): ChronicleComponent => {
	const existing = ctx.ecs.query(ChronicleComponent)[0];
	if (existing) {
		return existing[1];
	}
	const chronicle = new ChronicleComponent();
	ctx.ecs.createEntity([chronicle]);
	return chronicle;
};

const setFlagExecutor: OpExecutor = {
	arm(ctx, params) {
		chronicleOf(ctx).set(
			params.flag as string,
			params.value as string,
		);
	},
	poll() {
		return true;
	},
	skip(ctx, params) {
		chronicleOf(ctx).set(
			params.flag as string,
			params.value as string,
		);
	},
};

const barkText = (ctx: OpContext, knot: string): string => {
	const inkEntry = ctx.ecs.query(InkStoryComponent)[0];
	if (!inkEntry) {
		return "";
	}
	const story = ensureStory(inkEntry[1], ctx.events, ctx.ecs);
	const knotName = knot.split(".")[0];
	if (!knotName || !story.KnotContainerWithName(knotName)) {
		return "";
	}
	const snapshot = story.state.ToJson();
	try {
		story.ChoosePathString(knot);
		let text = "";
		while (story.canContinue) {
			const line = story.Continue();
			if (line && line.trim().length > 0) {
				text += (text.length > 0 ? " " : "") + line.trim();
			}
		}
		return text;
	} finally {
		story.state.LoadJson(snapshot);
	}
};

const barkExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		if (memory.attached === true) {
			return;
		}
		const actor = resolveActor(ctx.run, params.actor as ActorRef);
		if (!actor) {
			return;
		}
		const seconds = (params.seconds as number | undefined) ?? 3;
		const text = barkText(ctx, params.knot as string);
		ctx.ecs.addComponent(
			actor,
			new BarkComponent(text, new Duration(seconds)),
		);
		memory.attached = true;
	},
	poll() {
		return true;
	},
	skip(ctx, params, memory) {
		barkExecutor.arm(ctx, params, memory);
	},
	skippable() {
		return true;
	},
};

const assertKnotResolves = (story: Story, knot: string): void => {
	const [knotName, stitch] = knot.split(".");
	const container = knotName
		? story.KnotContainerWithName(knotName)
		: null;
	if (!container) {
		throw new Error(
			`dialogue: ink knot "${knotName}" does not exist (from "${knot}")`,
		);
	}
	if (stitch !== undefined && !container.namedContent.has(stitch)) {
		throw new Error(
			`dialogue: ink stitch "${stitch}" does not exist in knot "${knotName}" (from "${knot}")`,
		);
	}
};

const dialogueKnot = (ctx: OpContext, params: OpParams): string => {
	const key = params.knotKey as string | undefined;
	if (key !== undefined) {
		const value = ctx.run.blackboard[key];
		if (typeof value !== "string") {
			throw new Error(
				`dialogue: blackboard["${key}"] is not a knot string`,
			);
		}
		return value;
	}
	return params.knot as string;
};

const openDialogue = (
	ctx: OpContext,
	params: OpParams,
): EntityId | null => {
	const inkEntry = ctx.ecs.query(InkStoryComponent)[0];
	if (!inkEntry) {
		return null;
	}
	const story = ensureStory(inkEntry[1], ctx.events, ctx.ecs);
	const knot = dialogueKnot(ctx, params);
	assertKnotResolves(story, knot);
	const tags = story.TagsForContentAtPath(knot);
	const knotTags = knot.includes(".")
		? story.TagsForContentAtPath(knot.split(".")[0]!)
		: tags;
	const font = fontForTag(
		tagValue(tags, "font") ?? tagValue(knotTags, "font"),
	);
	const panel = panelForTag(
		tagValue(tags, "panel") ?? tagValue(knotTags, "panel"),
	);
	const source =
		params.source !== undefined
			? resolveActor(ctx.run, params.source as ActorRef)
			: null;
	story.ChoosePathString(knot);
	mirrorInkState(inkEntry[1]);
	const component = new DialogueComponent(source, font);
	component.speaker =
		(params.speaker as string | undefined) ??
		tagValue(tags, "speaker") ??
		tagValue(knotTags, "speaker") ??
		"";
	return ctx.ecs.createEntity([
		component,
		new DialoguePanelComponent(panel),
	]);
};

const choiceLabel = (
	state: DialogueComponent,
	index: number,
): string | undefined => {
	if (index < 0 || index >= state.choices.length) {
		return undefined;
	}
	return (
		tagValue(state.choiceTags[index] ?? null, "id") ??
		state.choices[index]
	);
};

const recordChoice = (
	state: DialogueComponent,
	params: OpParams,
	memory: OpMemory,
): void => {
	if (params.capture === undefined || state.choices.length === 0) {
		return;
	}
	const label = choiceLabel(state, state.selectedOption);
	if (label !== undefined) {
		memory.lastChoice = label;
	}
};

const captureChoice = (
	ctx: OpContext,
	params: OpParams,
	memory: OpMemory,
): void => {
	const capture = params.capture as string | undefined;
	if (
		capture !== undefined &&
		typeof memory.lastChoice === "string"
	) {
		ctx.run.blackboard[capture] = memory.lastChoice;
	}
};

const dialogueExecutor: OpExecutor = {
	arm(ctx, params, memory) {
		if (memory.dialogueRef !== undefined) {
			return;
		}
		const id = openDialogue(ctx, params);
		if (id !== null) {
			memory.dialogueRef = id;
		}
	},
	poll(ctx, params, memory) {
		const id = memory.dialogueRef as EntityId | undefined;
		if (id === undefined) {
			return true;
		}
		const state = ctx.ecs.getComponent(id, DialogueComponent);
		if (state) {
			recordChoice(state, params, memory);
			return false;
		}
		captureChoice(ctx, params, memory);
		return true;
	},
	skippable(ctx, _params, memory) {
		const id = memory.dialogueRef as EntityId | undefined;
		if (id === undefined) {
			return true;
		}
		const state = ctx.ecs.getComponent(id, DialogueComponent);
		return !state || state.choices.length === 0;
	},
	skip(ctx, params, memory) {
		const id = memory.dialogueRef as EntityId | undefined;
		if (id === undefined) {
			return;
		}
		const state = ctx.ecs.getComponent(id, DialogueComponent);
		if (!state) {
			return;
		}
		recordChoice(state, params, memory);
		captureChoice(ctx, params, memory);
		ctx.ecs.destroy(id);
		ctx.events.emit(new DialogueClosedEvent(id, state.source.id));
	},
};

const enemiesDeadPredicate = (
	ctx: OpContext,
	params: OpParams,
): boolean => {
	const tag = params.tag as string;
	for (const [id, sequenceTag] of ctx.ecs.query(
		SequenceTagComponent,
	)) {
		if (sequenceTag.tag !== tag) {
			continue;
		}
		const health = ctx.ecs.getComponent(id, HealthComponent);
		if (!health || health.hp > 0) {
			return false;
		}
	}
	return true;
};

const chronicleEqualsPredicate = (
	ctx: OpContext,
	params: OpParams,
): boolean => {
	const entry = ctx.ecs.query(ChronicleComponent)[0];
	if (!entry) {
		return false;
	}
	return (
		entry[1].get(params.flag as string) === (params.value as string)
	);
};

const playerResolver = (ctx: OpContext): EntityId | null =>
	ctx.ecs.query(PlayerInputComponent)[0]?.[0] ?? null;

const npcByKnotResolver = (
	ctx: OpContext,
	params: OpParams,
): EntityId | null =>
	ctx.ecs.find(
		DialogueSourceComponent,
		(source) => source.knot === (params.knot as string),
	)?.[0] ?? null;

const byTagResolver = (
	ctx: OpContext,
	params: OpParams,
): EntityId | null =>
	ctx.ecs.find(
		SequenceTagComponent,
		(tag) => tag.tag === (params.tag as string),
	)?.[0] ?? null;

const blackboardEntityResolver = (
	ctx: OpContext,
	params: OpParams,
): EntityId | null => {
	const value = ctx.run.blackboard[params.key as string];
	return typeof value === "string" ? (value as EntityId) : null;
};

const pickupByTypeResolver = (
	ctx: OpContext,
	params: OpParams,
): EntityId | null =>
	ctx.ecs.find(
		PickupComponent,
		(pickup) => pickup.type === (params.type as string),
	)?.[0] ?? null;

let registered = false;

export const registerGameSequenceOps = (): void => {
	if (registered) {
		return;
	}
	registered = true;
	registerOpType(OP_TYPES.walkTo, walkToExecutor);
	registerOpType(OP_TYPES.moveTo, moveToExecutor);
	registerOpType(OP_TYPES.escort, escortExecutor);
	registerOpType(OP_TYPES.spawn, spawnExecutor);
	registerOpType(OP_TYPES.despawn, despawnExecutor);
	registerOpType(OP_TYPES.setFlag, setFlagExecutor);
	registerOpType(OP_TYPES.bark, barkExecutor);
	registerOpType(OP_TYPES.dialogue, dialogueExecutor);
	registerPredicate(PREDICATE_IDS.enemiesDead, enemiesDeadPredicate);
	registerPredicate(
		PREDICATE_IDS.chronicleEquals,
		chronicleEqualsPredicate,
	);
	registerCastResolver("player", playerResolver);
	registerCastResolver("npcByKnot", npcByKnotResolver);
	registerCastResolver("byTag", byTagResolver);
	registerCastResolver("blackboardEntity", blackboardEntityResolver);
	registerCastResolver("pickupByType", pickupByTypeResolver);
};
