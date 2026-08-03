/** Id of the "You died" banner node. */
export const DEATH_OVERLAY_ID = "death-overlay";

/** Id of the quest toast node. */
export const QUEST_NOTICE_ID = "quest-notice";

/**
 * The HUD nodes a `NoticeComponent` can drive. A notice names its slot with one
 * of these ids, so `HudDynSystem` reaches the node it fades without a bare
 * string ever appearing at a call site.
 */
export type NoticeSlot =
	| typeof DEATH_OVERLAY_ID
	| typeof QUEST_NOTICE_ID;
