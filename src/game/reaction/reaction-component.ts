import type { EntityId } from "../../engine/ecs";
import { MachineState } from "../../engine/fsm/machine-state";
import {
	serializable,
	serialize,
} from "../../engine/serialization/serializable";
import type { EmotionId } from "../character/emotion-ids";
import type { ReactionId } from "./reaction-ids";
import { reactionLifecycleMachine } from "./reaction-lifecycle-def";
import {
	REACTION_TABLE_IDS,
	type ReactionTableId,
} from "./reaction-table-ids";

/**
 * An actor's reaction run-state: which authored table it draws from, where the
 * display lifecycle is, what is playing, and when each reaction last fired.
 *
 * The emotion is a **field**, not a machine state — `reactionLifecycleMachine`
 * owns only the phases, so the emotion vocabulary stays authored data.
 */
@serializable("Reaction")
export class ReactionComponent {
	/**
	 * Which set of reactions this actor may perform. A typed content reference,
	 * the same shape as `PickupComponent.type` — not a behaviour switch: the
	 * system reads no branch off it, it only selects an authored table.
	 *
	 * Which row *within* that table fires is a separate question, answered by the
	 * actor's reputation standing rather than by anything stored here — see
	 * {@link ReactionTableId} for how the two divide up.
	 */
	@serialize({ options: REACTION_TABLE_IDS })
	table: ReactionTableId;

	@serialize() machine: MachineState = new MachineState(
		reactionLifecycleMachine.initialLeaf,
		0,
	);

	/** The reaction playing right now, or `null` while idle. */
	@serialize() current: ReactionId | null = null;

	/** The emotion the playing reaction displays, or `null` while idle. */
	@serialize() emotion: EmotionId | null = null;

	/**
	 * Seconds since each reaction last fired, keyed by reaction id. An absent key
	 * means "never fired", which is always eligible.
	 */
	@serialize() sinceFired: Partial<Record<ReactionId, number>> = {};

	/**
	 * The noticed, non-hostile entities currently engaging this actor — facing it
	 * or walking at it. Arrivals into this set are what raise `noticed-friendly`;
	 * `PerceptionComponent.noticed` answers only who is *there*.
	 *
	 * Serialized for the same reason `noticed` is: a restored actor must not read
	 * everyone already stood in front of it as having just walked up, and re-greet
	 * the room on load.
	 */
	@serialize() engaged: EntityId[] = [];

	constructor(table: ReactionTableId = "npc") {
		this.table = table;
	}
}
