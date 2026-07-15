import {
	currentExclusiveSequence,
	SKIP_HOLD_SECONDS,
} from "../../engine/sequence/sequence-system";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { LastUsedDevice } from "../../engine/input/last-used-device";
import type { DynStore } from "../../engine/ui/bypass/dyn-store";
import { findById } from "../../engine/ui/input/node-tree";
import type { UiRoot } from "../../engine/ui/reconciler/ui-root";
import { ACTION_IDS } from "../input/action-ids";
import { resolveHint } from "./input-glyph-resolver";
import { resolveKbdFrame } from "./kbd-frame";
import { holdRingNodeId } from "./key-cap";
import { SKIP_KEYCAP_ID } from "./skip-hint";
import type { SkipHintState } from "./skip-hint-state";

export class SkipHintSyncSystem implements UpdateSystem {
	constructor(
		private readonly hud: SkipHintState,
		private readonly root: UiRoot,
		private readonly dyn: DynStore,
		private readonly lastUsed: LastUsedDevice,
	) {}

	update({ ecs, assetManager, actions, input }: UpdateContext): void {
		const sequence = currentExclusiveSequence(ecs);
		const open = sequence !== undefined && sequence.currentSkippable;
		const kbd = resolveKbdFrame(assetManager);
		const hint = resolveHint(
			assetManager,
			actions.getExpansion(),
			this.lastUsed.active,
			input,
			ACTION_IDS.cutsceneSkip,
		);
		this.hud.set({
			open,
			frame: kbd.image,
			insets: kbd.insets,
			glyph: hint.glyph ?? "E",
			icon: hint.icon,
			activation: hint.activation ?? "hold",
		});
		if (!open) {
			return;
		}
		const ring = findById(
			this.root.tree,
			holdRingNodeId(SKIP_KEYCAP_ID),
		);
		if (!ring) {
			return;
		}
		const progress = sequence
			? Math.min(1, sequence.skipHeldTime / SKIP_HOLD_SECONDS)
			: 0;
		this.dyn.setField(ring.id, "progress", progress);
	}
}
