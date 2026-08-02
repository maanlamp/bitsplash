declare const THUNDER_TAKE_ID_BRAND: unique symbol;

/**
 * The id of one thunder recording — a `thunder_*.wav` asset in the bank.
 *
 * Branded so a take can only be obtained from the generated accessor module
 * (`src/game/content/assets/assets.gen.ts`, written by `scripts/gen-assets.ts`),
 * never typed as a bare literal at a call site. A renamed or deleted take
 * therefore fails at `bun run gen` and `tsc`, rather than falling through to a
 * silent layer in the middle of a thunderclap.
 */
export type ThunderTakeId = string & {
	readonly [THUNDER_TAKE_ID_BRAND]: true;
};

/**
 * Brand a raw take id. Intended for the generated accessor module, which is the
 * only place that knows the `.wav` really exists.
 */
export const asThunderTakeId = (id: string): ThunderTakeId =>
	id as ThunderTakeId;
