import type { CutsceneDef } from "../../engine/cutscene/cutscene";
import {
	isCutsceneActive,
	startCutscene,
} from "../../engine/cutscene/cutscene-system";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { dialogue, follow } from "../cutscene/verbs";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { InteractEvent } from "../events";
import { PlayerInputComponent } from "../player/player-input-component";

export class DialogueTriggerSystem implements UpdateSystem {
	update({ ecs, events }: UpdateContext): void {
		if (isCutsceneActive(ecs)) {
			return;
		}
		for (const event of events.read(InteractEvent)) {
			const source = ecs.getComponent(
				event.interactable,
				DialogueSourceComponent,
			);
			if (!source) {
				continue;
			}
			const npc = event.interactable;
			const knot = source.knot;
			const def: CutsceneDef = {
				id: `dialogue:${knot}`,
				scenes: [
					function* (ctx) {
						const player =
							ctx.ecs.query(PlayerInputComponent)[0]?.[0] ?? null;
						follow(ctx, [player, npc]);
						yield dialogue(ctx, knot, npc);
						follow(ctx, [player]);
					},
				],
			};
			startCutscene(ecs, def);
			const stateEntry = ecs.query(InteractionStateComponent)[0];
			if (stateEntry) {
				stateEntry[1].pressedThisFrame = false;
			}
			return;
		}
	}
}
