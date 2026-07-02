import type { Story } from "inkjs/full";
import type AssetManager from "../assets";
import { Camera2DFollowComponent } from "../camera/camera-2d-follow-component";
import { isCutsceneActive } from "../cutscene/cutscene-system";
import { DialogueComponent } from "../dialogue/dialogue-component";
import { InkStoryComponent } from "../ink/ink-story-component";
import type { Seconds } from "../duration";
import type { ECS, EntityId } from "../ecs";
import type EventBus from "../events";
import type { LoadedFont } from "../load";
import { resolveFont } from "../text/resolve-font";
import {
	parseRichText,
	type RichLine,
	type StyledChar,
	wrapRichText,
} from "../text/rich-text";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	CharacterRevealedEvent,
	DialogueClosedEvent,
	DialogueOpenedEvent,
} from "./events";

export type DialogueBindings = Readonly<{
	textWidth: number;
	maxLines: number;
	charactersPerSecond: number;
	commaPauseChars: number;
	stopPauseChars: number;
	slideIn: Seconds;
	slideOut: Seconds;
	advancePressed: (ctx: UpdateContext) => boolean;
	consumeAdvance: (ctx: UpdateContext) => void;
	cancelHeld: (ctx: UpdateContext) => boolean;
	navUpHeld: (ctx: UpdateContext) => boolean;
	navDownHeld: (ctx: UpdateContext) => boolean;
	playerId: (ecs: ECS) => EntityId | null;
}>;

const punctuationPause = (
	char: string | undefined,
	bindings: DialogueBindings,
): number => {
	if (char === ",") {
		return bindings.commaPauseChars;
	}
	if (char === "." || char === "!" || char === "?") {
		return bindings.stopPauseChars;
	}
	return 0;
};

const SENTENCE_END = new Set([".", "!", "?"]);

const splitSentences = (chars: StyledChar[]): StyledChar[][] => {
	const sentences: StyledChar[][] = [];
	let current: StyledChar[] = [];
	let i = 0;
	while (i < chars.length) {
		current.push(chars[i]!);
		const ch = chars[i]!.char;
		const next = chars[i + 1]?.char;
		if (
			SENTENCE_END.has(ch) &&
			(next === undefined || next === " " || next === "\n")
		) {
			let j = i + 1;
			while (j < chars.length && chars[j]!.char === " ") {
				current.push(chars[j]!);
				j++;
			}
			sentences.push(current);
			current = [];
			i = j;
			continue;
		}
		i++;
	}
	if (current.length > 0) {
		sentences.push(current);
	}
	return sentences;
};

const paginate = (
	font: LoadedFont,
	chars: StyledChar[],
	maxWidth: number,
	maxLines: number,
): RichLine[][] => {
	const pages: RichLine[][] = [];
	let current: StyledChar[] = [];
	for (const sentence of splitSentences(chars)) {
		const combined = current.concat(sentence);
		if (
			current.length > 0 &&
			wrapRichText(font, combined, maxWidth).length > maxLines
		) {
			pages.push(wrapRichText(font, current, maxWidth));
			current = sentence.slice();
		} else {
			current = combined;
		}
	}
	if (current.length > 0) {
		pages.push(wrapRichText(font, current, maxWidth));
	}
	return pages.length > 0 ? pages : [[]];
};

const pageChars = (page: RichLine[]): string[] => {
	const chars: string[] = [];
	for (const line of page) {
		for (const g of line.glyphs) {
			chars.push(g.char);
		}
	}
	return chars;
};

export class DialogueSystem implements UpdateSystem {
	private bindings: DialogueBindings;

	constructor(bindings: DialogueBindings) {
		this.bindings = bindings;
	}

	update(ctx: UpdateContext): void {
		const { dt, ecs, events, assetManager } = ctx;
		const entry = ecs.query(DialogueComponent)[0];
		if (!entry) {
			return;
		}
		const [id, state] = entry;

		const inkEntry = ecs.query(InkStoryComponent)[0];
		const story = inkEntry ? inkEntry[1].story : null;
		if (!story) {
			return;
		}

		const pressed = this.bindings.advancePressed(ctx);
		const consume = (): void => {
			this.bindings.consumeAdvance(ctx);
		};

		if (!state.opened) {
			state.opened = true;
			state.phase = "entering";
			state.slide.retarget(
				0,
				1,
				this.bindings.slideIn,
				"easeOutBack",
			);
			this.setCameraTargets(ecs, [this.playerId(ecs), state.source]);
			events.emit(new DialogueOpenedEvent(id));
			this.gatherBlock(story, state, assetManager);
		}

		state.slide.tick(dt);

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

		this.ensurePages(state, assetManager);
		if (!state.paginated) {
			if (pressed) {
				consume();
			}
			return;
		}

		const escHeld = this.bindings.cancelHeld(ctx);
		const escPressed = escHeld && !state.escHeld;
		state.escHeld = escHeld;
		if (escPressed) {
			this.beginClose(state);
			return;
		}

		const page = state.pages[state.pageIndex] ?? [];
		const chars = pageChars(page);
		const total = chars.length;

		if (!state.complete) {
			if (pressed) {
				state.revealed = total;
				state.pause = 0 as Seconds;
				consume();
			} else if (state.pause > 0) {
				state.pause = Math.max(0, state.pause - dt / 1000) as Seconds;
			} else {
				const cps = this.bindings.charactersPerSecond;
				const prev = Math.floor(state.revealed);
				state.revealed = Math.min(
					total,
					state.revealed + (cps * dt) / 1000,
				);
				const now = Math.floor(state.revealed);
				if (now > prev && state.revealed < total) {
					const char = chars[now - 1];
					if (char && char.trim().length > 0) {
						events.emit(
							new CharacterRevealedEvent(id, char, now - 1),
						);
					}
					const extra = punctuationPause(char, this.bindings);
					if (extra > 0) {
						state.pause = (extra / cps) as Seconds;
					}
				}
			}
			if (state.revealed >= total) {
				state.complete = true;
			}
			return;
		}

		const lastPage = state.pageIndex >= state.pages.length - 1;
		if (!lastPage) {
			if (pressed) {
				consume();
				state.pageIndex += 1;
				state.revealed = 0;
				state.pause = 0 as Seconds;
				state.complete = false;
			}
			return;
		}

		if (state.choices.length === 0) {
			if (pressed) {
				consume();
				this.beginClose(state);
			}
			return;
		}

		state.selectedOption = Math.min(
			state.selectedOption,
			state.choices.length - 1,
		);
		this.handleNavigation(ctx, state);

		if (pressed) {
			consume();
			story.ChooseChoiceIndex(state.selectedOption);
			if (!this.gatherBlock(story, state, assetManager)) {
				this.beginClose(state);
			}
		}
	}

	private gatherBlock(
		story: Story,
		state: DialogueComponent,
		assetManager: AssetManager,
	): boolean {
		let text = "";
		while (story.canContinue) {
			const line = story.Continue();
			if (line && line.trim().length > 0) {
				text += (text.length > 0 ? " " : "") + line.trim();
			}
		}
		state.choices = story.currentChoices.map((choice) => choice.text);
		state.text = text;
		state.paginated = false;
		state.pages = [[]];
		state.pageIndex = 0;
		state.revealed = 0;
		state.pause = 0 as Seconds;
		state.complete = false;
		state.selectedOption = 0;
		this.ensurePages(state, assetManager);
		return text.length > 0 || state.choices.length > 0;
	}

	private ensurePages(
		state: DialogueComponent,
		assetManager: AssetManager,
	): void {
		if (state.paginated) {
			return;
		}
		const font = resolveFont(state.font, assetManager);
		if (state.text.length > 0 && !font) {
			return;
		}
		state.pages =
			state.text.length > 0 && font
				? paginate(
						font,
						parseRichText(state.text),
						this.bindings.textWidth,
						this.bindings.maxLines,
					)
				: [[]];
		state.pageIndex = 0;
		state.revealed = 0;
		state.pause = 0 as Seconds;
		state.complete = state.text.length === 0;
		state.paginated = true;
	}

	private handleNavigation(
		ctx: UpdateContext,
		state: DialogueComponent,
	): void {
		const count = state.choices.length;
		const upHeld = this.bindings.navUpHeld(ctx);
		const downHeld = this.bindings.navDownHeld(ctx);
		if (upHeld && !state.navUpHeld) {
			state.selectedOption =
				(state.selectedOption - 1 + count) % count;
		}
		if (downHeld && !state.navDownHeld) {
			state.selectedOption = (state.selectedOption + 1) % count;
		}
		state.navUpHeld = upHeld;
		state.navDownHeld = downHeld;
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
			"easeInCubic",
		);
	}

	private finishClose(
		ecs: ECS,
		events: EventBus,
		id: EntityId,
		state: DialogueComponent,
	): void {
		this.setCameraTargets(ecs, [this.playerId(ecs)]);
		ecs.destroyEntity(id);
		events.emit(new DialogueClosedEvent(id, state.source));
	}

	private playerId(ecs: ECS): EntityId | null {
		return this.bindings.playerId(ecs);
	}

	private setCameraTargets(
		ecs: ECS,
		targets: ReadonlyArray<EntityId | null>,
	): void {
		if (isCutsceneActive(ecs)) {
			return;
		}
		const followEntry = ecs.query(Camera2DFollowComponent)[0];
		if (!followEntry) {
			return;
		}
		followEntry[1].targets = targets.filter(
			(id): id is EntityId => id !== null,
		);
	}
}
