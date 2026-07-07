import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import { FactionComponent } from "./faction-component";

export type Reaction = "hostile" | "neutral" | "friendly";

const FACTION_PAIRS: Readonly<
	Record<string, Readonly<Record<string, Reaction>>>
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
