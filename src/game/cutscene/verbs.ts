import type {
	CutsceneContext,
	CutsceneWait,
} from "../../engine/cutscene/cutscene";
import { Camera2DFollowComponent } from "../../engine/camera/camera-2d-follow-component";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { DialogueClosedEvent } from "../../engine/dialogue/events";
import type { Seconds } from "../../engine/duration";
import type { EntityId } from "../../engine/ecs";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import type { ECS } from "../../engine/ecs";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import { NavAgentComponent } from "../../engine/nav/nav-agent-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { TransformComponent } from "../../engine/transform-component";
import { TILE_SIZE } from "../../engine/tilemap/tile";
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
	ctx: CutsceneContext,
	entity: EntityId,
	x: number,
	speed = 2 * TILE_SIZE,
): CutsceneWait => {
	let lastX: number | null = null;
	let stalled = 0;
	const teleport = (): void => {
		const transform = ctx.ecs.getComponent(
			entity,
			TransformComponent,
		);
		const intent = ctx.ecs.getComponent(
			entity,
			MovementIntentComponent,
		);
		const body = ctx.ecs.getComponent(entity, PhysicsBodyComponent);
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
	const drive = (dtMs: number): boolean => {
		const transform = ctx.ecs.getComponent(
			entity,
			TransformComponent,
		);
		const intent = ctx.ecs.getComponent(
			entity,
			MovementIntentComponent,
		);
		const body = ctx.ecs.getComponent(entity, PhysicsBodyComponent);
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
			stalled += dtMs / 1000;
		} else {
			stalled = 0;
		}
		lastX = transform.position.x;
		if (stalled >= WALK_STUCK_SECONDS) {
			console.warn(
				`walkTo: entity ${entity} stuck; teleporting to ${x}`,
			);
			teleport();
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
		done: (c) => drive(c.dt),
		complete: () => {
			teleport();
			return true;
		},
	};
};

export const moveTo = (
	ctx: CutsceneContext,
	entity: EntityId,
	target: Vector2 | EntityId,
	opts: { arriveTolerance?: number } = {},
): CutsceneWait => {
	const ecs = ctx.ecs;
	const transform = ecs.getComponent(entity, TransformComponent);
	const body = ecs.getComponent(entity, PhysicsBodyComponent);

	const destVec = (): Vector2 | null => {
		if (target instanceof Vector2) {
			return target.clone();
		}
		const tr = ecs.getComponent(target, TransformComponent);
		return tr ? tr.position.clone() : null;
	};

	if (!transform || !body?.body) {
		const dest = destVec();
		if (!dest) {
			return { done: () => true, complete: () => true };
		}
		return walkTo(ctx, entity, dest.x);
	}

	const attach = ensureNavActuation(ecs, entity);
	const agent = attach.agent;
	if (opts.arriveTolerance !== undefined) {
		agent.arriveTolerance = opts.arriveTolerance;
	}
	agent.target = target;
	agent.status = "idle";
	agent.path = [];

	const cleanup = (): void => {
		const a = ecs.getComponent(entity, NavAgentComponent);
		if (a) {
			a.target = null;
			a.status = "idle";
			a.path = [];
		}
		ecs.getComponent(entity, MovementIntentComponent)?.clear();
		if (attach.addedAgent) {
			ecs.removeComponent(entity, NavAgentComponent);
		}
		if (attach.addedIntent) {
			ecs.removeComponent(entity, MovementIntentComponent);
		}
	};

	const teleport = (): void => {
		const dest = destVec();
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
		done: () => {
			const a = ecs.getComponent(entity, NavAgentComponent);
			if (!a) {
				return true;
			}
			if (a.status === "arrived") {
				cleanup();
				return true;
			}
			if (a.status === "unreachable") {
				console.warn(
					`moveTo: entity ${entity} unreachable; teleporting.`,
				);
				teleport();
				cleanup();
				return true;
			}
			return false;
		},
		complete: () => {
			teleport();
			cleanup();
			return true;
		},
	};
};

export const escort = (
	ctx: CutsceneContext,
	follower: EntityId,
	leader: EntityId,
	dest: Vector2,
): CutsceneWait => {
	const ecs = ctx.ecs;
	const leaderWait = walkTo(ctx, leader, dest.x);
	const attach = ensureNavActuation(ecs, follower);
	attach.agent.target = null;
	attach.agent.status = "idle";
	attach.agent.path = [];

	let addedFollow = false;
	let followComp = ecs.getComponent(follower, FollowComponent);
	if (!followComp) {
		followComp = new FollowComponent();
		ecs.addComponent(follower, followComp);
		addedFollow = true;
	}
	followComp.leader = leader;

	const closeEnough = (): boolean => {
		const fp = ecs.getComponent(follower, TransformComponent);
		const lp = ecs.getComponent(leader, TransformComponent);
		return (
			!!fp &&
			!!lp &&
			fp.position.distanceTo(lp.position) <=
				followComp!.followDistance + ARRIVE_TOLERANCE
		);
	};

	const cleanup = (): void => {
		const a = ecs.getComponent(follower, NavAgentComponent);
		if (a) {
			a.target = null;
			a.status = "idle";
			a.path = [];
		}
		ecs.getComponent(follower, MovementIntentComponent)?.clear();
		if (addedFollow) {
			ecs.removeComponent(follower, FollowComponent);
		} else {
			followComp!.leader = null;
		}
		if (attach.addedAgent) {
			ecs.removeComponent(follower, NavAgentComponent);
		}
		if (attach.addedIntent) {
			ecs.removeComponent(follower, MovementIntentComponent);
		}
	};

	let leaderDone = false;
	return {
		done: (c) => {
			if (!leaderDone) {
				leaderDone = leaderWait.done(c);
			}
			if (leaderDone && closeEnough()) {
				cleanup();
				return true;
			}
			return false;
		},
		complete: (c) => {
			leaderWait.complete(c);
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
			cleanup();
			return true;
		},
	};
};

export const follow = (
	ctx: CutsceneContext,
	targets: ReadonlyArray<EntityId | null>,
): void => {
	const entry = ctx.ecs.query(Camera2DFollowComponent)[0];
	if (!entry) {
		return;
	}
	entry[1].targets = targets.filter(
		(id): id is EntityId => id !== null,
	);
};

export const dialogue = (
	ctx: CutsceneContext,
	knot: string,
	source: EntityId | null = null,
): CutsceneWait => {
	const inkEntry = ctx.ecs.query(InkStoryComponent)[0];
	if (!inkEntry) {
		return { done: () => true, complete: () => true };
	}
	const story = ensureStory(inkEntry[1], ctx.events, ctx.ecs);
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
	const dialogueComponent = new DialogueComponent(source, font);
	dialogueComponent.speaker =
		tagValue(tags, "speaker") ?? tagValue(knotTags, "speaker") ?? "";
	const id = ctx.ecs.createEntity([
		dialogueComponent,
		new DialoguePanelComponent(panel),
	]);
	return {
		done: () =>
			ctx.ecs.getComponent(id, DialogueComponent) === undefined,
		complete: () => {
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
			ctx.ecs.destroyEntity(id);
			ctx.events.emit(new DialogueClosedEvent(id, source));
			return true;
		},
	};
};
