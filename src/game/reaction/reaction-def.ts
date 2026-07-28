import type { EmotionId } from "../character/emotion-ids";
import type { StandingId } from "../character/standing-ids";
import type { Knot } from "../../engine/ink/knot";
import type { ReactionId, StimulusId } from "./reaction-ids";

/**
 * One loaded row of a reaction table: what makes an actor react, who it applies
 * to, what it feels while reacting, how long the display lasts and how long
 * before it may repeat.
 *
 * Every field is authored data except {@link bark}, which the loader derives from
 * {@link id} through the generated `Reactions.line` record — the bark line for a
 * reaction is determined by its id, so it can never be mis-referenced.
 *
 * Durations are seconds and map onto the three phases of
 * `reactionLifecycleMachine`; `enter` and `exit` are the pop-in and pop-out, and
 * `hold` is how long the emotion and the bark stay up.
 */
export type ReactionDef = Readonly<{
	id: ReactionId;
	stimulus: StimulusId;
	emotion: EmotionId;
	/**
	 * The standings this row applies to. Tone is authored here: the warm greeting
	 * lists only `"warm"`, so a wary character reaches a different row or none at
	 * all. List every member of `STANDING_IDS` for a reaction that standing must
	 * not gate — an alert at a hostile, say, which faction stance already decides.
	 */
	standings: readonly StandingId[];
	/** Highest wins when one stimulus makes several reactions eligible. */
	priority: number;
	/** Seconds after firing before this reaction is eligible again. */
	cooldown: number;
	/**
	 * Fires at most once in an actor's lifetime, {@link cooldown} notwithstanding.
	 * A first hello is a first hello; hearing it again every time the player walks
	 * back into view is what made NPCs feel like greeters at a shop door.
	 */
	once: boolean;
	enter: number;
	hold: number;
	exit: number;
	bark: Knot;
}>;
