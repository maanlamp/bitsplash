import type { ReactNode } from "react";
import { View } from "../../engine/ui/reconciler/ui-elements";
import type { Style } from "../../engine/ui/style/style";
import { characterById } from "../character/character-descriptor";
import type { BubbleFrame } from "./bubble-frame";
import { ChoiceOption } from "./choice-option";
import {
	choiceOptionId,
	CONVERSATION_PANEL_ID,
	messageRowId,
} from "./conversation-nodes";
import {
	CONVERSATION_UI,
	type ChoiceView,
	type MessageView,
} from "./conversation-view";
import { NpcMessage } from "./npc-message";
import { NpcMessageRetained } from "./npc-message-retained";
import { PlayerMessage } from "./player-message";
import { PlayerMessageRetained } from "./player-message-retained";
import { PlayerNarration } from "./player-narration";

const PANEL: Style = {
	flexDirection: "column",
	width: CONVERSATION_UI.panelWidth,
	gap: CONVERSATION_UI.messageGap,
};

const CHOICES: Style = {
	flexDirection: "column",
	alignItems: "flex-end",
	gap: CONVERSATION_UI.choiceGap,
	marginTop: CONVERSATION_UI.choicesGap - CONVERSATION_UI.messageGap,
};

export type ConversationPanelProps = Readonly<{
	id?: string;
	/** The messages currently in the window, oldest first. */
	messages: readonly MessageView[];
	/** The choices pending right now, empty when none are. */
	choices: readonly ChoiceView[];
	frame: BubbleFrame;
	onChoiceFocus?: (index: number) => void;
	onChoiceConfirm?: (index: number) => void;
	/**
	 * Asked when focus tries to walk up off the oldest message in the window.
	 * Return `true` when the transcript scrolled instead, which keeps focus where
	 * it is while the window moves under it.
	 */
	onReadBack?: () => boolean;
}>;

/**
 * Pick the composite for one row.
 *
 * Only the newest row is portrayed in full: three portraits and three speaker
 * labels crowd the screen at a high `uiScale`, and alignment, typeface and tail
 * direction already carry identity, so retained rows drop both and keep a
 * portrait-width spacer to stay aligned. Narration never has a portrait at all.
 */
const messageBody = (
	view: MessageView,
	frame: BubbleFrame,
	newest: boolean,
): ReactNode => {
	if (view.message.kind === "narration") {
		return <PlayerNarration view={view} frame={frame} />;
	}
	if (characterById(view.message.characterId).isPlayer) {
		return newest ? (
			<PlayerMessage view={view} frame={frame} />
		) : (
			<PlayerMessageRetained view={view} frame={frame} />
		);
	}
	return newest ? (
		<NpcMessage view={view} frame={frame} />
	) : (
		<NpcMessageRetained view={view} frame={frame} />
	);
};

/**
 * The conversation itself: a fixed-width column of aligned message rows with the
 * pending choices below them. It carries no chrome of its own — no background, no
 * advance hint — and no positioning, so the caller places it (an `Overlay`
 * anchored bottom-centre, say).
 *
 * Which composite a message renders through comes from the message, its
 * character's descriptor and its place in the window, never from a prop: a
 * `narration` entry is the player's own record and gets `PlayerNarration`,
 * `isPlayer` picks the player side, and only the newest row is portrayed in full
 * — older rows use the `*Retained` composites, which drop the portrait and label.
 * Those composites are what encode left versus right.
 *
 * Every row is focusable and carries explicit `focusNeighbors`, so one ordered
 * chain runs from the oldest visible message down through the newest and on into
 * the choices — up from the topmost choice enters history, down from the newest
 * message re-enters the choices. Naming each link rather than leaving it to
 * geometric scoring is what keeps the hop between the newest row and the
 * right-aligned choice column deterministic, and what lets the oldest row answer
 * an up-press by scrolling the window instead of surrendering focus.
 *
 * @example
 * <Overlay style={{ justifyContent: "flex-end", alignItems: "center" }}>
 *   <ConversationPanel messages={window} choices={pending} frame={frame} />
 * </Overlay>
 */
export const ConversationPanel = ({
	id = CONVERSATION_PANEL_ID,
	messages,
	choices,
	frame,
	onChoiceFocus,
	onChoiceConfirm,
	onReadBack,
}: ConversationPanelProps) => {
	const rowIds = messages.map((view) => messageRowId(view.index));
	const choiceIds = choices.map((view) => choiceOptionId(view.index));
	const firstChoiceId = choiceIds[0];
	const lastRowId = rowIds.at(-1);
	return (
		<View id={id} style={PANEL}>
			{messages.map((view, slot) => (
				<View
					key={view.index}
					id={rowIds[slot]}
					focusable
					focusNeighbors={{
						up: rowIds[slot - 1],
						down: rowIds[slot + 1] ?? firstChoiceId,
					}}
					onFocusMove={
						slot === 0
							? (event) =>
									event.direction === "up" && onReadBack?.() === true
							: undefined
					}
				>
					{messageBody(view, frame, slot === messages.length - 1)}
				</View>
			))}
			{choices.length > 0 ? (
				<View style={CHOICES}>
					{choices.map((view, slot) => (
						<ChoiceOption
							key={view.index}
							view={view}
							frame={frame}
							id={choiceIds[slot]!}
							focusNeighbors={{
								up: choiceIds[slot - 1] ?? lastRowId,
								down: choiceIds[slot + 1],
							}}
							onFocus={() => onChoiceFocus?.(view.index)}
							onConfirm={() => onChoiceConfirm?.(view.index)}
							onClick={() => onChoiceConfirm?.(view.index)}
						/>
					))}
				</View>
			) : null}
		</View>
	);
};
