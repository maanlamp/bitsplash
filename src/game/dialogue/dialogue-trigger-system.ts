import type { CutsceneDef } from "../../engine/cutscene/cutscene";
import {
	isCutsceneActive,
	startCutscene,
} from "../../engine/cutscene/cutscene-system";
import type { EntityId } from "../../engine/ecs";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
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
			this.faceInteractor(ecs, npc, event.interactor);
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
