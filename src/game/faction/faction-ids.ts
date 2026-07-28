/**
 * Every faction an entity can belong to.
 *
 * `neutral` is {@link FactionComponent}'s constructor default; `folk` is the
 * faction ordinary NPCs carry, which is what makes them perceivable without
 * giving them Health.
 */
export const FACTION_IDS = [
	"player",
	"margrave",
	"neutral",
	"folk",
] as const;

export type FactionId = (typeof FACTION_IDS)[number];
