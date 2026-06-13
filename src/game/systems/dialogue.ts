import { Camera2DFollowComponent } from "../../engine/components/camera-2d-follow";
import type { ECS, EntityId } from "../../engine/ecs";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { DialogueComponent } from "../components/dialogue";
import { InteractionStateComponent } from "../components/interaction-state";
import { PlayerInputComponent } from "../components/player-input";
import {
	CharacterRevealedEvent,
	DialogueClosedEvent,
	DialogueOpenedEvent,
} from "../events";

const COMMA_PAUSE = 8;
const STOP_PAUSE = 20;

const punctuationPause = (char: string | undefined): number => {
	if (char === ",") {
		return COMMA_PAUSE;
	}
	if (char === "." || char === "!" || char === "?") {
		return STOP_PAUSE;
	}
	return 0;
};

export class DialogueSystem implements UpdateSystem {
	update({ dt, ecs, events }: UpdateContext): void {
		const entry = ecs.query(DialogueComponent)[0];
		if (!entry) {
			return;
		}
		const [dialogueId, dialogue] = entry;

		const stateEntry = ecs.query(InteractionStateComponent)[0];
		const state = stateEntry ? stateEntry[1] : null;
		const pressed = state?.pressedThisFrame ?? false;

		if (!dialogue.opened) {
			dialogue.opened = true;
			if (dialogue.frameTarget) {
				this.setCameraTargets(ecs, [
					this.playerId(ecs),
					dialogue.frameTarget,
				]);
			}
			events.emit(new DialogueOpenedEvent(dialogueId));
		}

		if (!dialogue.complete) {
			if (pressed) {
				dialogue.revealed = dialogue.total;
				dialogue.pause = 0;
				if (state) {
					state.pressedThisFrame = false;
				}
			} else if (dialogue.pause > 0) {
				dialogue.pause = Math.max(0, dialogue.pause - dt / 1000);
			} else {
				const prev = Math.floor(dialogue.revealed);
				dialogue.revealed = Math.min(
					dialogue.total,
					dialogue.revealed +
						(dialogue.charactersPerSecond * dt) / 1000,
				);
				const now = Math.floor(dialogue.revealed);
				if (now > prev && dialogue.revealed < dialogue.total) {
					const char = dialogue.text[now - 1];
					if (char && char.trim().length > 0) {
						events.emit(
							new CharacterRevealedEvent(dialogueId, char, now - 1),
						);
					}
					const extra = punctuationPause(char);
					if (extra > 0) {
						dialogue.pause = extra / dialogue.charactersPerSecond;
					}
				}
			}
			if (dialogue.revealed >= dialogue.total) {
				dialogue.complete = true;
			}
			return;
		}

		if (pressed) {
			if (state) {
				state.pressedThisFrame = false;
			}
			this.setCameraTargets(ecs, [this.playerId(ecs)]);
			ecs.destroyEntity(dialogueId);
			events.emit(
				new DialogueClosedEvent(dialogueId, dialogue.source),
			);
		}
	}

	private playerId(ecs: ECS): EntityId | null {
		const player = ecs.query(PlayerInputComponent)[0];
		return player ? player[0] : null;
	}

	private setCameraTargets(
		ecs: ECS,
		targets: ReadonlyArray<EntityId | null>,
	): void {
		const followEntry = ecs.query(Camera2DFollowComponent)[0];
		if (!followEntry) {
			return;
		}
		followEntry[1].targets = targets.filter(
			(id): id is EntityId => id !== null,
		);
	}
}
