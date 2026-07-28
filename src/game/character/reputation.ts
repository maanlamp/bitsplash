import type { CharacterId } from "./character-ids";
import type { StandingId } from "./standing-ids";

/**
 * **A seam, not a system.** One hardcoded standing per character and nothing
 * else: no accumulation, no events, no decay, no per-save state, no way for
 * anything in the game to change what is written here. It exists so the rest of
 * the codebase can already ask "how does this character regard the player?" and
 * so authored content can already answer differently per character — which is
 * what makes it obvious what a real reputation system would have to provide.
 *
 * When that system arrives it replaces this table wholesale: the call sites keep
 * using {@link standingTowardPlayer} and stop caring where the answer came from.
 * Until then, editing a value here is the only way to change a standing.
 *
 * Standing is toward **the player** only — there is no pair table. Every reaction
 * that reads a standing is a reaction to the player, so a full character-by-
 * character matrix would be nine columns of unused data.
 */
const STANDINGS: Readonly<Record<CharacterId, StandingId>> = {
	/** The player's regard for themselves is never read; total for exhaustiveness. */
	player: "warm",
	/** The campfire companion, and the one character who is glad to see you. */
	bramble: "warm",
	/** A checkpoint guard doing a job: correct, not friendly. */
	pennywhistle: "neutral",
	quartermaster: "neutral",
	quickfoot: "neutral",
	/** Nameless, shifty, and not about to greet a stranger warmly. */
	stranger: "wary",
	/** A wild animal: it clocks you and says nothing. */
	critter: "cold",
	raider: "cold",
	signpost: "neutral",
};

/**
 * How the given character regards the player.
 *
 * The table is total over `CHARACTER_IDS` by type, so a new character without a
 * standing fails at `tsc` rather than defaulting to friendly.
 *
 * @example
 * const standing = standingTowardPlayer(character.character);
 * if (!def.standings.includes(standing)) continue;
 */
export const standingTowardPlayer = (id: CharacterId): StandingId =>
	STANDINGS[id];
