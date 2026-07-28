/**
 * The emotion vocabulary shared by dialogue portraits and overhead reaction
 * icons.
 *
 * Ink authors reach these through `# emotion:` tags, validated against this
 * tuple by `scripts/gen-ink.ts`; the reaction slice maps each one to an icon
 * cell through a `Record<EmotionId, IconCell>` so a missing icon fails at
 * `tsc` rather than drawing a wrong crop.
 *
 * It lives in the character slice because the dialogue portrait is its first
 * consumer.
 */
export const EMOTION_IDS = [
	"neutral",
	"happy",
	"sad",
	"angry",
	"surprised",
	"afraid",
	"curious",
	"thinking",
	"smug",
	"embarrassed",
	"hurt",
	"determined",
] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];

const EMOTION_ID_SET: ReadonlySet<string> = new Set(EMOTION_IDS);

/**
 * Narrows an untrusted string — an ink tag value, an authored reaction table
 * entry — to an {@link EmotionId}.
 */
export const isEmotionId = (value: string): value is EmotionId =>
	EMOTION_ID_SET.has(value);
