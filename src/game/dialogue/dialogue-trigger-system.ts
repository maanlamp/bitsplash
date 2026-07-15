import type { EntityId } from "../../engine/ecs";
import { MovementIntentComponent } from "../../engine/locomotion/movement-intent-component";
import {
	isExclusiveSequenceActive,
	startSequence,
} from "../../engine/sequence/sequence-system";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { DialogueSourceComponent } from "../dialogue/dialogue-source-component";
import { InteractEvent } from "../events";
import { ACTION_IDS } from "../input/action-ids";
import { npcChatSequence } from "../sequence/npc-chat-sequence";

export class DialogueTriggerSystem implements UpdateSystem {
	update({ ecs, events, actions }: UpdateContext): void {
		if (isExclusiveSequenceActive(ecs)) {
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
			startSequence(ecs, npcChatSequence, {
				knot: source.knot,
				npc,
			});
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
