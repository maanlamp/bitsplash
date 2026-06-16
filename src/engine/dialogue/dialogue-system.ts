import type { Story } from "inkjs/full";
import type AssetManager from "../assets";
import { Camera2DFollowComponent } from "../components/camera-2d-follow";
import { DialogueComponent } from "../components/dialogue";
import { InkStoryComponent } from "../components/ink-story";
import type { Seconds } from "../duration";
import type { ECS, EntityId } from "../ecs";
import type EventBus from "../events";
import type { LoadedFont } from "../load";
import { resolveFont } from "../resolve-font";
import {
	parseRichText,
	type RichLine,
	type StyledChar,
	wrapRichText,
} from "../rich-text";
import { type UpdateContext, UpdateSystem } from "../system";
import {
	CharacterRevealedEvent,
	DialogueClosedEvent,
	DialogueOpenedEvent,
} from "./events";

export type DialogueBindings = Readonly<{
	textWidth: number;
	maxLines: number;
	advancePressed: (ctx: UpdateContext) => boolean;
	consumeAdvance: (ctx: UpdateContext) => void;
	cancelHeld: (ctx: UpdateContext) => boolean;
	navUpHeld: (ctx: UpdateContext) => boolean;
	navDownHeld: (ctx: UpdateContext) => boolean;
	playerId: (ecs: ECS) => EntityId | null;
}>;

const COMMA_PAUSE = 8;
const STOP_PAUSE = 20;

const SLIDE_IN = 0.35 as Seconds;
const SLIDE_OUT = 0.25 as Seconds;

const punctuationPause = (char: string | undefined): number => {
	if (char === ",") {
		return COMMA_PAUSE;
	}
	if (char === "." || char === "!" || char === "?") {
		return STOP_PAUSE;
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
			state.slide.retarget(0, 1, SLIDE_IN, "easeOutBack");
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
				const prev = Math.floor(state.revealed);
				state.revealed = Math.min(
					total,
					state.revealed + (state.charactersPerSecond * dt) / 1000,
				);
				const now = Math.floor(state.revealed);
				if (now > prev && state.revealed < total) {
					const char = chars[now - 1];
					if (char && char.trim().length > 0) {
						events.emit(
							new CharacterRevealedEvent(id, char, now - 1),
						);
					}
					const extra = punctuationPause(char);
					if (extra > 0) {
						state.pause = (extra /
							state.charactersPerSecond) as Seconds;
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

		const font = resolveFont(state.font, assetManager);
		state.pages =
			text.length > 0 && font
				? paginate(
						font,
						parseRichText(text),
						this.bindings.textWidth,
						this.bindings.maxLines,
					)
				: [[]];
		state.pageIndex = 0;
		state.revealed = 0;
		state.pause = 0 as Seconds;
		state.complete = text.length === 0;
		state.selectedOption = 0;
		return text.length > 0 || state.choices.length > 0;
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
			SLIDE_OUT,
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
		const followEntry = ecs.query(Camera2DFollowComponent)[0];
		if (!followEntry) {
			return;
		}
		followEntry[1].targets = targets.filter(
			(id): id is EntityId => id !== null,
		);
	}
}
