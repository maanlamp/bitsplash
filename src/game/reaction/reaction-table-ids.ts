/**
 * Every authored reaction table.
 *
 * A table is the set of reactions one kind of actor may perform, so a guard
 * cannot taunt and a raider cannot cheer. One member here is one JSON file under
 * `src/game/content/reactions/`, statically imported by `loader.ts` into a
 * `Record<ReactionTableId, …>` — adding a member without its file fails at
 * `tsc`.
 *
 * **This is not the same axis as a standing.** A table answers *what kind of
 * thing may this actor ever do* — a role, fixed at authoring time, chosen per
 * prefab. A row's `standings` column answers *which of those does this
 * relationship call for* — tone, resolved per actor through the reputation seam.
 * The table narrows the candidate rows; the standing filters what survives. A row
 * never selects a table and a table never encodes tone, so the two cannot
 * disagree.
 *
 * `ReactionComponent.table` is the only cross-reference to this tuple, typed and
 * `@serialize({ options })`-backed the same way `PickupComponent.type` and
 * `FactionComponent.faction` are.
 */
export const REACTION_TABLE_IDS = ["npc", "enemy"] as const;

export type ReactionTableId = (typeof REACTION_TABLE_IDS)[number];
