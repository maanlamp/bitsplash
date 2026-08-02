import { isExclusiveSequenceRunning } from "../../engine/sequence/sequence-system";
import { entityTop } from "../../engine/sprite/entity-top";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import type { LastUsedDevice } from "../../engine/input/last-used-device";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { ACTION_IDS } from "../input/action-ids";
import { resolveHint } from "../ui/input-glyph-resolver";
import { resolveKbdFrame } from "../ui/kbd-frame";
import { InteractableComponent } from "./interactable-component";
import { InteractionStateComponent } from "./interaction-state-component";
import {
	HINT_HALF_WIDTH,
	INTERACT_HINT_ID,
} from "./interact-hint-hud";
import type { InteractHintHudState } from "./interact-hint-hud-state";
import { profiler } from "../../engine/profiling/profiler";

const GAP = 20;

/**
 * Places the "press E" keycap above the interactable in range. Cleared whenever
 * an exclusive sequence is running — matching `DialogueTriggerSystem`'s gate, so
 * the keycap never promises an interaction that would be silently swallowed.
 */
@profiler("Interact hint HUD", "HUD")
export class InteractHintHudSystem implements UpdateSystem {
	constructor(
		private readonly hud: InteractHintHudState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
		private readonly lastUsed: LastUsedDevice,
	) {}

	update({ ecs, assetManager, actions, input }: UpdateContext): void {
		const state = ecs.queryFirst(InteractionStateComponent)?.[1];
		const inRange = state?.inRange ?? null;
		const interactable = inRange
			? ecs.getComponent(inRange, InteractableComponent)
			: null;
		const transform = inRange
			? ecs.getComponent(inRange, TransformComponent)
			: null;
		if (
			isExclusiveSequenceRunning(ecs) ||
			!state ||
			!inRange ||
			!interactable ||
			!transform
		) {
			this.hud.clear();
			return;
		}

		const kbd = resolveKbdFrame(assetManager);
		const hint = resolveHint(
			assetManager,
			actions.getExpansion(),
			this.lastUsed.active,
			input,
			ACTION_IDS.interact,
		);
		this.hud.set({
			entity: inRange,
			glyph: hint.glyph ?? state.interactGlyph,
			font: interactable.font,
			frame: kbd.image,
			insets: kbd.insets,
			icon: hint.icon,
			activation: hint.activation ?? "press",
		});

		const node = findById(this.root.tree, INTERACT_HINT_ID);
		if (!node) {
			return;
		}
		this.dyn.set(node.id, {
			worldX: transform.position.x - HINT_HALF_WIDTH,
			worldY:
				entityTop(ecs, assetManager, inRange, GAP) ??
				transform.position.y - GAP,
		});
	}
}
