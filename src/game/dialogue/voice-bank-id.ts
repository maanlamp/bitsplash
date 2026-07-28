declare const VOICE_BANK_ID_BRAND: unique symbol;

/**
 * The id of a synthesised-speech bank — one `voice_bank_*.wav` asset, sliced
 * into per-vowel takes by {@link import("./voice-bank").loadBank}.
 *
 * Branded so a bank can only be obtained from the generated accessor module
 * (`src/game/content/assets/assets.gen.ts`, written by `scripts/gen-assets.ts`),
 * never typed as a bare literal. A renamed or deleted `.wav` therefore fails at
 * `bun run gen` and `tsc`, rather than falling through to silence.
 */
export type VoiceBankId = string & {
	readonly [VOICE_BANK_ID_BRAND]: true;
};

/**
 * Brand a raw bank id. Intended for the generated accessor module, which is the
 * only place that knows the `.wav` really exists.
 */
export const asVoiceBankId = (id: string): VoiceBankId =>
	id as VoiceBankId;
