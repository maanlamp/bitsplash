import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { FactionComponent } from "./faction-component";
import type { FactionId } from "./faction-ids";

export type Reaction = "hostile" | "neutral" | "friendly";

/**
 * Stances keyed `from → to`, and **one-directional**: an entry says nothing
 * about the reverse pair. `margrave → player` is `"hostile"` while
 * `player → margrave` has no entry and therefore reads `"neutral"`. Any pair
 * left out reads `"neutral"`, so the table only ever lists departures from
 * indifference.
 *
 * The asymmetry is inert today: the only consumer that would notice,
 * `melee-system.ts`, runs solely for enemies because the player prefab carries
 * `Bow` and no `Melee`. Add the reverse entry deliberately if that changes —
 * do not assume symmetry.
 */
const FACTION_PAIRS: Readonly<
	Partial<
		Record<FactionId, Readonly<Partial<Record<FactionId, Reaction>>>>
	>
> = {
	margrave: { player: "hostile" },
};

export const getReaction = (
	ecs: ReadonlyECS,
	from: EntityId,
	to: EntityId,
): Reaction => {
	const a = ecs.getComponent(from, FactionComponent);
	const b = ecs.getComponent(to, FactionComponent);
	if (!a || !b) {
		return "neutral";
	}
	return FACTION_PAIRS[a.faction]?.[b.faction] ?? "neutral";
};
