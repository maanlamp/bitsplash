/**
 * Every authored reaction.
 *
 * One reaction is one row in the tables under `src/game/content/reactions/`,
 * and every id here must have a matching bark stitch in the reactions knot —
 * `scripts/gen-ink.ts` emits `Reactions.line: Record<ReactionId, Knot>` and
 * throws at `bun run gen` when a stitch is missing.
 *
 * Named `ReactionId` rather than `Reaction` deliberately: `faction/reaction.ts`
 * already owns `Reaction` for faction stances, and the two vocabularies must
 * not collide.
 */
export const REACTION_IDS = [
	"enemy-alert",
	"enemy-taunt",
	"npc-greet",
	"npc-nod",
	"npc-wary",
	"npc-startle",
	"npc-farewell",
	"npc-cheer",
] as const;

export type ReactionId = (typeof REACTION_IDS)[number];

const REACTION_ID_SET: ReadonlySet<string> = new Set(REACTION_IDS);

/**
 * Narrows an untrusted string — an authored reaction table's `id` column — to a
 * {@link ReactionId}.
 */
export const isReactionId = (value: string): value is ReactionId =>
	REACTION_ID_SET.has(value);

/**
 * Every stimulus a reaction table can key on.
 *
 * `noticed-hostile` / `noticed-friendly` are driven by the perception notice
 * pass, which records what an entity can see with no stance filter;
 * `lost-sight` fires when a noticed entity leaves the set; `took-damage` comes
 * from perception's existing damage stimuli.
 *
 * `noticed-friendly` carries one extra condition the others do not: the noticed
 * entity must also be *engaging* the actor (see `engagement.ts`). Being seen is
 * not the same as saying hello, and hostility needs no such courtesy.
 */
export const STIMULUS_IDS = [
	"noticed-hostile",
	"noticed-friendly",
	"lost-sight",
	"took-damage",
] as const;

export type StimulusId = (typeof STIMULUS_IDS)[number];

const STIMULUS_ID_SET: ReadonlySet<string> = new Set(STIMULUS_IDS);

/**
 * Narrows an untrusted string — an authored reaction table's `stimulus` column —
 * to a {@link StimulusId}.
 */
export const isStimulusId = (value: string): value is StimulusId =>
	STIMULUS_ID_SET.has(value);
