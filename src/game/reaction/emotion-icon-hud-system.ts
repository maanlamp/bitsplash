import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { profiler } from "../../engine/profiling/profiler";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import {
	EMOTION_ICON_HALF_WIDTH,
	emotionIconNodeId,
} from "./emotion-icon-hud";
import type {
	EmotionIconEntry,
	EmotionIconHudState,
} from "./emotion-icon-hud-state";
import { ReactionComponent } from "./reaction-component";
import { resolveEmotionIcon } from "./resolve-emotion-icon";

/** Clearance above the sprite's tallest pose, so the icon never overlaps art. */
const GAP = 22;

/**
 * How far above an entity's art the emotion icon reaches, or `0` when it is not
 * reacting.
 *
 * Anything else anchored over the same head stacks on top of this rather than
 * fighting it for the space: a reaction sets its emotion and its bark on the same
 * frame, so an icon and a bark bubble are the normal case, not an edge one.
 *
 * @example
 * const gap = bark.offset + emotionStackHeight(ecs, id);
 */
export const emotionStackHeight = (
	ecs: ReadonlyECS,
	id: EntityId,
): number =>
	ecs.getComponent(id, ReactionComponent)?.emotion ? GAP : 0;

/**
 * Places an emotion icon above every actor mid-reaction.
 *
 * Membership follows the reaction lifecycle rather than any timer of its own:
 * `ReactionComponent.emotion` is set as `reacting` is entered and cleared as it
 * is exited, so a node lives for exactly the `entering`/`holding`/`exiting`
 * span and unmounts on `idle`.
 */
@profiler("Emotion icon HUD", "HUD")
export class EmotionIconHudSystem implements UpdateSystem {
	constructor(
		private readonly store: EmotionIconHudState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
	) {}

	update({ ecs, assetManager }: UpdateContext): void {
		const entries: EmotionIconEntry[] = [];
		for (const [id, reaction, transform] of ecs.query(
			ReactionComponent,
			TransformComponent,
		)) {
			if (reaction.emotion === null) {
				continue;
			}
			entries.push({
				entity: id,
				icon: resolveEmotionIcon(assetManager, reaction.emotion),
			});
			const node = findById(this.root.tree, emotionIconNodeId(id));
			if (!node) {
				continue;
			}
			this.dyn.set(node.id, {
				worldX: transform.position.x - EMOTION_ICON_HALF_WIDTH,
				worldY:
					entityTop(ecs, assetManager, id, GAP) ??
					transform.position.y - GAP,
			});
		}
		this.store.setEntries(entries);
	}
}
