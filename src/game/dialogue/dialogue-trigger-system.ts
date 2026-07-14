import type { CutsceneDef } from "../../engine/cutscene/cutscene";
import {
	isCutsceneActive,
	startCutscene,
} from "../../engine/cutscene/cutscene-system";
import { step } from "../../engine/cutscene/verbs";
import type { EntityId } from "../../engine/ecs";
import { asKnot } from "../../engine/ink/knot";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { dialogue, follow } from "../cutscene/verbs";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import { InteractEvent } from "../events";
import { ACTION_IDS } from "../input/action-ids";
import { PlayerInputComponent } from "../player/player-input-component";

export class DialogueTriggerSystem implements UpdateSystem {
	update({ ecs, events, actions }: UpdateContext): void {
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
			this.faceInteractor(ecs, npc, event.interactor);
			const knot = source.knot;
			const def: CutsceneDef = {
				id: `dialogue:${knot}`,
				scenes: [
					function* (api) {
						const player = api.read(
							(ctx) =>
								ctx.ecs.query(PlayerInputComponent)[0]?.[0] ?? null,
						);
						api.effect((ctx) => follow(ctx.ecs, [player, npc]));
						yield* step(api, "line", (a) =>
							dialogue(a, asKnot(knot), npc),
						);
						api.effect((ctx) => follow(ctx.ecs, [player]));
					},
				],
			};
			startCutscene(ecs, def);
			actions.consume(ACTION_IDS.interact);
			return;
		}
	}

	private faceInteractor(
		ecs: UpdateContext["ecs"],
		npc: EntityId,
		interactor: EntityId,
	): void {
		const intent = ecs.getComponent(npc, MovementIntentComponent);
		const npcTransform = ecs.getComponent(npc, TransformComponent);
		const interactorTransform = ecs.getComponent(
			interactor,
			TransformComponent,
		);
		if (!intent || !npcTransform || !interactorTransform) {
			return;
		}
		const dx =
			interactorTransform.position.x - npcTransform.position.x;
		if (dx !== 0) {
			intent.faceX = Math.sign(dx);
		}
	}
}
