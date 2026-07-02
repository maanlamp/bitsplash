import type {
	CutsceneContext,
	CutsceneWait,
} from "../../engine/cutscene/cutscene";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { DialogueClosedEvent } from "../../engine/dialogue/events";
import type { EntityId } from "../../engine/ecs";
import { InkStoryComponent } from "../../engine/ink/ink-story-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { TransformComponent } from "../../engine/transform-component";
import { TILE_SIZE } from "../../engine/tilemap/tile";
import Vector2 from "../../engine/vector2";
import { DialoguePanelComponent } from "../dialogue/dialogue-panel-component";
import { ensureStory } from "../dialogue/ink-bindings";
import { fontForTag } from "../dialogue/ink-fonts";
import { panelForTag } from "../dialogue/ink-panels";
import { tagValue } from "../dialogue/ink-tags";
import { PlayerInputComponent } from "../player/player-input-component";

const ARRIVE_TOLERANCE = 4;

export const walkTo = (
	ctx: CutsceneContext,
	entity: EntityId,
	x: number,
	speed = 2 * TILE_SIZE,
): CutsceneWait => {
	const drive = (): boolean => {
		const transform = ctx.ecs.getComponent(
			entity,
			TransformComponent,
		);
		const player = ctx.ecs.getComponent(entity, PlayerInputComponent);
		const body = ctx.ecs.getComponent(entity, PhysicsBodyComponent);
		if (!transform) {
			return true;
		}
		const dx = x - transform.position.x;
		if (Math.abs(dx) <= ARRIVE_TOLERANCE) {
			if (player) {
				player.scriptedMoveDir = null;
			} else if (body?.body) {
				body.linearVelocity = new Vector2(0, body.linearVelocity.y);
			}
			return true;
		}
		const dir = Math.sign(dx);
		if (player) {
			player.scriptedMoveDir = dir;
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
		done: () => drive(),
		complete: () => {
			const transform = ctx.ecs.getComponent(
				entity,
				TransformComponent,
			);
			const player = ctx.ecs.getComponent(
				entity,
				PlayerInputComponent,
			);
			const body = ctx.ecs.getComponent(entity, PhysicsBodyComponent);
			if (player) {
				player.scriptedMoveDir = null;
			}
			if (!transform) {
				return;
			}
			transform.position.x = x;
			if (body?.body) {
				body.body.setTransform(transform.position, 0);
				body.linearVelocity = new Vector2(0, body.linearVelocity.y);
			}
		},
	};
};

export const dialogue = (
	ctx: CutsceneContext,
	knot: string,
	source: EntityId | null = null,
): CutsceneWait => {
	const inkEntry = ctx.ecs.query(InkStoryComponent)[0];
	if (!inkEntry) {
		return { done: () => true, complete: () => {} };
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
			if (ctx.ecs.getComponent(id, DialogueComponent)) {
				ctx.ecs.destroyEntity(id);
				ctx.events.emit(new DialogueClosedEvent(id, source));
			}
		},
	};
};
