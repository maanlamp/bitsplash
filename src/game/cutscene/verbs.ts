import type { Story } from "inkjs/full";
import { Camera2DFollowComponent } from "../../engine/camera/camera-2d-follow-component";
import type { Framing } from "../../engine/camera/framing";
import type {
	CutsceneApi,
	CutsceneVerb,
} from "../../engine/cutscene/cutscene";
import { focusOn, parallel } from "../../engine/cutscene/verbs";
import type { Knot } from "../../engine/ink/knot";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { DialogueClosedEvent } from "../../engine/dialogue/events";
import type { Seconds } from "../../engine/duration";
import type { ECS, EntityId } from "../../engine/ecs";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { DialoguePanelComponent } from "../dialogue/dialogue-panel-component";
import { ensureStory } from "../dialogue/ink-bindings";
import { fontForTag } from "../dialogue/ink-fonts";
import { panelForTag } from "../dialogue/ink-panels";
import { tagValue } from "../dialogue/ink-tags";
import { FollowComponent } from "../follow/follow-component";
import { PlayerInputComponent } from "../player/player-input-component";

const ARRIVE_TOLERANCE = 4;
const WALK_STUCK_SECONDS = 2;

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

export const walkTo = (
	entity: EntityId,
	x: number,
	speed = 2 * TILE_SIZE,
): CutsceneVerb => {
	let lastX: number | null = null;
	let stalled = 0;
	const teleport = (ecs: ECS): void => {
		const transform = ecs.getComponent(entity, TransformComponent);
		const intent = ecs.getComponent(entity, MovementIntentComponent);
		const body = ecs.getComponent(entity, PhysicsBodyComponent);
		if (intent) {
			intent.moveX = 0;
		}
		if (!transform) {
			return;
		}
		transform.position.x = x;
		if (body?.body) {
			body.body.setTransform(transform.position, 0);
			body.linearVelocity = new Vector2(0, body.linearVelocity.y);
		}
	};
	const drive = (ecs: ECS, dt: number): boolean => {
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
		if (
			lastX !== null &&
			Math.abs(transform.position.x - lastX) < 0.5
		) {
			stalled += dt;
		} else {
			stalled = 0;
		}
		lastX = transform.position.x;
		if (stalled >= WALK_STUCK_SECONDS) {
			console.warn(
				`walkTo: entity ${entity} stuck; teleporting to ${x}`,
			);
			teleport(ecs);
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
		} else {
			return true;
		}
		return false;
	};
	return {
		poll: (ctx, tick) => drive(ctx.ecs, tick.dt),
		complete: (ctx) => {
			teleport(ctx.ecs);
			return true;
		},
	};
};

export const moveTo = (
	api: CutsceneApi,
	entity: EntityId,
	target: Vector2 | EntityId,
	opts: { arriveTolerance?: number } = {},
): CutsceneVerb => {
	const destVec = (ecs: ECS): Vector2 | null => {
		if (target instanceof Vector2) {
			return target.clone();
		}
		const tr = ecs.getComponent(target, TransformComponent);
		return tr ? tr.position.clone() : null;
	};

	const actuated = api.read((ctx) => {
		const transform = ctx.ecs.getComponent(
			entity,
			TransformComponent,
		);
		const body = ctx.ecs.getComponent(entity, PhysicsBodyComponent);
		return !!transform && !!body?.body;
	});

	if (!actuated) {
		const destX = api.read((ctx) => destVec(ctx.ecs)?.x);
		if (destX === undefined) {
			return { poll: () => true, complete: () => true };
		}
		return walkTo(entity, destX);
	}

	const cleanup = (ecs: ECS): void => {
		const a = ecs.getComponent(entity, NavAgentComponent);
		if (a) {
			a.target = null;
			a.status = "idle";
			a.path = [];
		}
		ecs.getComponent(entity, MovementIntentComponent)?.clear();
		if (api.recall("addedAgent")) {
			ecs.removeComponent(entity, NavAgentComponent);
		}
		if (api.recall("addedIntent")) {
			ecs.removeComponent(entity, MovementIntentComponent);
		}
	};

	const teleport = (ecs: ECS): void => {
		const dest = destVec(ecs);
		const t = ecs.getComponent(entity, TransformComponent);
		const b = ecs.getComponent(entity, PhysicsBodyComponent);
		if (dest && t) {
			t.position.copy(dest);
			if (b?.body) {
				b.body.setTransform(t.position, 0);
				b.linearVelocity = new Vector2(0, 0);
			}
		}
	};

	return {
		setup: () =>
			api.effect((ctx) => {
				const attach = ensureNavActuation(ctx.ecs, entity);
				api.remember("addedAgent", attach.addedAgent);
				api.remember("addedIntent", attach.addedIntent);
				if (opts.arriveTolerance !== undefined) {
					attach.agent.arriveTolerance = opts.arriveTolerance;
				}
				attach.agent.target = target;
				attach.agent.status = "idle";
				attach.agent.path = [];
			}),
		poll: (ctx) => {
			const ecs = ctx.ecs;
			const a = ecs.getComponent(entity, NavAgentComponent);
			if (!a) {
				return true;
			}
			if (a.status === "arrived") {
				cleanup(ecs);
				return true;
			}
			if (a.status === "unreachable") {
				console.warn(
					`moveTo: entity ${entity} unreachable; teleporting.`,
				);
				teleport(ecs);
				cleanup(ecs);
				return true;
			}
			if (a.target === null) {
				a.target = target;
				a.status = "idle";
				a.path = [];
			}
			return false;
		},
		complete: (ctx) => {
			teleport(ctx.ecs);
			cleanup(ctx.ecs);
			return true;
		},
	};
};

export const escort = (
	api: CutsceneApi,
	follower: EntityId,
	leader: EntityId,
	dest: Vector2,
): CutsceneVerb => {
	const leaderWalk = walkTo(leader, dest.x);
	let leaderDone = false;

	const closeEnough = (ecs: ECS): boolean => {
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

	const cleanup = (ecs: ECS): void => {
		const a = ecs.getComponent(follower, NavAgentComponent);
		if (a) {
			a.target = null;
			a.status = "idle";
			a.path = [];
		}
		ecs.getComponent(follower, MovementIntentComponent)?.clear();
		const follow = ecs.getComponent(follower, FollowComponent);
		if (api.recall("addedFollow")) {
			ecs.removeComponent(follower, FollowComponent);
		} else if (follow) {
			follow.leader = null;
		}
		if (api.recall("addedAgent")) {
			ecs.removeComponent(follower, NavAgentComponent);
		}
		if (api.recall("addedIntent")) {
			ecs.removeComponent(follower, MovementIntentComponent);
		}
	};

	return {
		setup: () =>
			api.effect((ctx) => {
				const ecs = ctx.ecs;
				const attach = ensureNavActuation(ecs, follower);
				attach.agent.target = null;
				attach.agent.status = "idle";
				attach.agent.path = [];
				api.remember("addedAgent", attach.addedAgent);
				api.remember("addedIntent", attach.addedIntent);
				let follow = ecs.getComponent(follower, FollowComponent);
				let addedFollow = false;
				if (!follow) {
					follow = new FollowComponent();
					ecs.addComponent(follower, follow);
					addedFollow = true;
				}
				follow.leader = leader;
				api.remember("addedFollow", addedFollow);
			}),
		poll: (ctx, tick) => {
			if (!leaderDone) {
				leaderDone = leaderWalk.poll(ctx, tick);
			}
			if (leaderDone && closeEnough(ctx.ecs)) {
				cleanup(ctx.ecs);
				return true;
			}
			return false;
		},
		complete: (ctx) => {
			leaderWalk.complete?.(ctx);
			const ecs = ctx.ecs;
			const lp = ecs.getComponent(leader, TransformComponent);
			const fp = ecs.getComponent(follower, TransformComponent);
			const body = ecs.getComponent(follower, PhysicsBodyComponent);
			if (lp && fp) {
				fp.position.copy(lp.position);
				if (body?.body) {
					body.body.setTransform(fp.position, 0);
					body.linearVelocity = new Vector2(0, 0);
				}
			}
			cleanup(ecs);
			return true;
		},
	};
};

export const follow = (
	ecs: ECS,
	targets: ReadonlyArray<EntityId | null>,
): void => {
	const entry = ecs.query(Camera2DFollowComponent)[0];
	if (!entry) {
		return;
	}
	entry[1].targets = targets.filter(
		(id): id is EntityId => id !== null,
	);
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
			`dialogue: ink stitch "${stitch}" does not exist in knot "${knotName}" (from "${knot}"); inkjs would silently resolve it to the parent knot`,
		);
	}
};

export const dialogue = (
	api: CutsceneApi,
	knot: Knot,
	source: EntityId | null = null,
): CutsceneVerb => ({
	setup: () => {
		const hasInk = api.read(
			(ctx) => ctx.ecs.query(InkStoryComponent).length > 0,
		);
		if (!hasInk) {
			return;
		}
		api.spawn("dialogue", (ctx) => {
			const inkEntry = ctx.ecs.query(InkStoryComponent)[0]!;
			const story = ensureStory(inkEntry[1], ctx.events, ctx.ecs);
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
			story.ChoosePathString(knot);
			const component = new DialogueComponent(source, font);
			component.speaker =
				tagValue(tags, "speaker") ??
				tagValue(knotTags, "speaker") ??
				"";
			return ctx.ecs.createEntity([
				component,
				new DialoguePanelComponent(panel),
			]);
		});
	},
	poll: (ctx) => {
		const id = api.ref("dialogue");
		if (id === undefined) {
			return true;
		}
		return ctx.ecs.getComponent(id, DialogueComponent) === undefined;
	},
	skippable: (ctx) => {
		const id = api.ref("dialogue");
		if (id === undefined) {
			return true;
		}
		const state = ctx.ecs.getComponent(id, DialogueComponent);
		return !state || state.choices.length === 0;
	},
	complete: (ctx) => {
		const id = api.ref("dialogue");
		if (id === undefined) {
			return true;
		}
		const state = ctx.ecs.getComponent(id, DialogueComponent);
		if (!state) {
			return true;
		}
		if (state.choices.length > 0) {
			if (state.paginated) {
				state.pageIndex = state.pages.length - 1;
				state.revealed = Infinity;
				state.pause = 0 as Seconds;
				state.complete = true;
			}
			return false;
		}
		ctx.ecs.destroy(id);
		ctx.events.emit(new DialogueClosedEvent(id, source));
		return true;
	},
});

export type Pan = Readonly<{
	target: EntityId | Vector2;
	framing: Framing;
}>;

export const say = (
	api: CutsceneApi,
	source: EntityId | null,
	knot: Knot,
	pan?: Pan,
): CutsceneVerb =>
	pan
		? parallel(
				api,
				(a) => dialogue(a, knot, source),
				(a) => focusOn(a, pan.target, pan.framing),
			)
		: dialogue(api, knot, source);

export const release = (
	api: CutsceneApi,
	actor: EntityId,
	framing: Framing,
): CutsceneVerb => focusOn(api, actor, framing);
