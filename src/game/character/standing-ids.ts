/**
 * How warmly a character regards the player — the whole vocabulary of the
 * reputation seam.
 *
 * Ordered coldest to warmest for readability only; nothing compares two
 * standings. A reaction row names the standings it applies to, so tone is
 * authored as membership rather than as a threshold, and a standing no row
 * covers means the character simply stays quiet.
 *
 * Hostility is deliberately absent: that is the faction table's job
 * (`faction/reaction.ts`), and duplicating it here would give two answers to one
 * question.
 */
export const STANDING_IDS = [
	"cold",
	"wary",
	"neutral",
	"warm",
] as const;

export type StandingId = (typeof STANDING_IDS)[number];

const STANDING_ID_SET: ReadonlySet<string> = new Set(STANDING_IDS);

/**
 * Narrows an untrusted string — an authored reaction row's `standings` entry — to
 * a {@link StandingId}.
 */
export const isStandingId = (value: string): value is StandingId =>
	STANDING_ID_SET.has(value);
