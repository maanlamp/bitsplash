import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import type { LastUsedDevice } from "../../engine/input/last-used-device";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { ACTION_IDS } from "../input/action-ids";
import { resolveHint } from "../ui/input-glyph-resolver";
import { resolveKbdFrame } from "../ui/kbd-frame";
import { resolveBubbleFrame } from "./bubble-frame";
import { ConversationComponent } from "./conversation-component";
import { presentedMessageIndex } from "./conversation-nodes";
import { ConversationPops } from "./conversation-pops";
import { ConversationWraps } from "./conversation-wraps";
import type { DialogueHudState } from "./dialogue-hud-state";
import { UI_FONT } from "./dialogue-ui";
import { profiler } from "../../engine/profiling/profiler";

/**
 * Publishes the conversation window for React and advances the window's pop
 * animations.
 *
 * Wrapping happens here rather than in the components because it needs a loaded
 * font and the transcript stores raw text — and it is done only for the two or
 * three messages the window shows, lazily, so a fast-forward can keep appending
 * to the transcript before any font has resolved.
 */
@profiler("Dialogue HUD sync", "HUD")
export class DialogueHudSyncSystem implements UpdateSystem {
	private readonly wraps = new ConversationWraps();
	private readonly pops = new ConversationPops();

	constructor(
		private readonly hud: DialogueHudState,
		private readonly lastUsed: LastUsedDevice,
	) {}

	update({
		dt,
		ecs,
		assetManager,
		actions,
		input,
	}: UpdateContext): void {
		const entry = ecs.queryFirst(DialogueComponent);
		const conversation = ecs.queryFirst(ConversationComponent)?.[1];
		if (!entry || !conversation) {
			this.hud.close();
			this.wraps.reset();
			this.pops.reset();
			return;
		}
		const [, state] = entry;
		this.hud.setComponent(state);
		this.hud.setConversation(conversation);
		this.hud.markInteractive();
		this.pops.step(conversation, dt);

		const fallbackGlyph =
			ecs.queryFirst(InteractionStateComponent)?.[1].interactGlyph ??
			"E";
		const hint = resolveHint(
			assetManager,
			actions.getExpansion(),
			this.lastUsed.active,
			input,
			ACTION_IDS.dialogueAdvance,
		);

		const kbd = resolveKbdFrame(assetManager);
		this.hud.setSnapshot({
			open: true,
			messages: this.wraps.messageViews(
				conversation,
				assetManager,
				presentedMessageIndex(ecs),
			),
			choices: state.complete
				? this.wraps.choiceViews(
						state.choices,
						state.selectedOption,
						UI_FONT,
						assetManager,
					)
				: [],
			frame: resolveBubbleFrame(assetManager),
			advanceGlyph: hint.glyph ?? fallbackGlyph,
			advanceIcon: hint.icon,
			advanceActivation: hint.activation ?? "press",
			kbdFrame: kbd.image,
			kbdInsets: kbd.insets,
			uiFont: UI_FONT,
		});
	}
}
