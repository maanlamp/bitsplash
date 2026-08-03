import type { Story } from "inkjs";
import type AssetManager from "../assets";
import { Ease } from "../animation/ease";
import { DialogueComponent } from "../dialogue/dialogue-component";
import { InkStoryComponent } from "../ink/ink-story-component";
import type { Seconds } from "../duration";
import type { ECS, EntityId } from "../ecs";
import type EventBus from "../events";
import { mirrorInkState } from "../ink/story";
import { profiler } from "../profiling/profiler";
import { resolveFont } from "../text/resolve-font";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	EMPTY_WRAPPED_TEXT,
	type PauseBindings,
	wrapDialogueText,
	type WrappedText,
} from "./dialogue-text";
import {
	CharacterRevealedEvent,
	DialogueClosedEvent,
	DialogueOpenedEvent,
} from "./events";

export type DialogueBindings = PauseBindings &
	Readonly<{
		textWidth: number;
		charactersPerSecond: number;
		slideIn: Seconds;
		slideOut: Seconds;
		advancePressed: (ctx: UpdateContext) => boolean;
		consumeAdvance: (ctx: UpdateContext) => void;
		/**
		 * Put the session's next message on screen: step to the next message the
		 * story already produced, or drive `Continue()` for more, writing the
		 * result into `state.text` and `state.choices`. Returns `false` — leaving
		 * `state` untouched — when nothing is left to show, which closes the
		 * session.
		 *
		 * It is a binding because recording the message in the conversation
		 * transcript needs the game's character vocabulary, which the engine may
		 * not import.
		 */
		present: (
			ctx: UpdateContext,
			state: DialogueComponent,
			story: Story,
		) => boolean;
	}>;

@profiler("Dialogue", "Dialogue")
export class DialogueSystem implements UpdateSystem {
	private bindings: DialogueBindings;

	constructor(bindings: DialogueBindings) {
		this.bindings = bindings;
	}

	update(ctx: UpdateContext): void {
		const { dt, ecs, events, assetManager } = ctx;
		const entry = ecs.queryFirst(DialogueComponent);
		if (!entry) {
			return;
		}
		const [id, state] = entry;

		const inkEntry = ecs.queryFirst(InkStoryComponent);
		const inkComponent = inkEntry ? inkEntry[1] : null;
		const story = inkComponent ? inkComponent.story : null;
		if (!inkComponent || !story) {
			return;
		}

		const pressed = this.bindings.advancePressed(ctx);
		const uiConfirm = state.pendingConfirm;
		state.pendingConfirm = false;
		const consume = (): void => {
			this.bindings.consumeAdvance(ctx);
		};

		if (!state.opened) {
			state.opened = true;
			state.phase = "entering";
			state.slide.retarget(0, 1, this.bindings.slideIn, Ease.OutBack);
			events.emit(new DialogueOpenedEvent(id));
		}

		state.slide.tick((dt / 1000) as Seconds);

		if (state.phase === "closing") {
			if (state.slide.done()) {
				this.finishClose(ecs, events, id, state);
			}
			return;
		}

		if (state.phase === "entering") {
			if (!state.slide.done()) {
				return;
			}
			state.phase = "open";
		}

		const wrapped = this.ensureWrapped(state, assetManager);
		if (!wrapped) {
			if (pressed) {
				consume();
			}
			return;
		}

		const total = wrapped.chars.length;

		if (!state.complete) {
			if (pressed) {
				state.revealed = total;
				state.pause.restart(0);
				consume();
			} else if (!state.pause.done()) {
				state.pause.tick((dt / 1000) as Seconds);
			} else {
				const speed = wrapped.speeds[Math.floor(state.revealed)] ?? 1;
				const cps = this.bindings.charactersPerSecond * speed;
				state.cps = cps;
				const prev = Math.floor(state.revealed);
				state.revealed = Math.min(
					total,
					state.revealed + (cps * dt) / 1000,
				);
				const now = Math.floor(state.revealed);
				if (now > prev && state.revealed < total) {
					const char = wrapped.chars[now - 1];
					if (char && char.trim().length > 0) {
						events.emit(
							new CharacterRevealedEvent(id, char, now - 1),
						);
					}
					const extra = wrapped.pauses[now - 1] ?? 0;
					if (extra > 0) {
						state.pause.restart(extra / cps);
					}
				}
			}
			if (state.revealed >= total) {
				state.complete = true;
			}
			return;
		}

		if (state.choices.length === 0) {
			if (pressed) {
				consume();
				const advanced = this.bindings.present(ctx, state, story);
				mirrorInkState(inkComponent);
				if (!advanced) {
					this.beginClose(state);
				}
			}
			return;
		}

		state.selectedOption = Math.min(
			state.selectedOption,
			state.choices.length - 1,
		);

		if (pressed || uiConfirm) {
			consume();
			story.ChooseChoiceIndex(state.selectedOption);
			const advanced = this.bindings.present(ctx, state, story);
			mirrorInkState(inkComponent);
			if (!advanced) {
				this.beginClose(state);
			}
		}
	}

	private ensureWrapped(
		state: DialogueComponent,
		assetManager: AssetManager,
	): WrappedText | null {
		if (state.wrapped?.source !== state.text) {
			if (state.text.length === 0) {
				state.wrapped = EMPTY_WRAPPED_TEXT;
			} else {
				const font = resolveFont(state.font, assetManager);
				if (!font) {
					return null;
				}
				state.wrapped = wrapDialogueText(
					state.text,
					font,
					this.bindings.textWidth,
					this.bindings,
				);
			}
			state.revealed = Math.min(
				state.revealed,
				state.wrapped.chars.length,
			);
			state.pause.restart(0);
			state.complete = state.revealed >= state.wrapped.chars.length;
		}
		return state.wrapped;
	}

	private beginClose(state: DialogueComponent): void {
		if (state.phase === "closing") {
			return;
		}
		state.phase = "closing";
		state.slide.retarget(
			state.slide.value(),
			0,
			this.bindings.slideOut,
			Ease.InCubic,
		);
	}

	private finishClose(
		ecs: ECS,
		events: EventBus,
		id: EntityId,
		state: DialogueComponent,
	): void {
		ecs.destroy(id);
		events.emit(new DialogueClosedEvent(id, state.source.id));
	}
}
