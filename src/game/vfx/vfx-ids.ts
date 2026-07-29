/**
 * Every effect the game ships, as a `const` tuple.
 *
 * This is the type-safe handle for cross-referencing an effect from TypeScript —
 * a one-shot spawn site, a test, an editor default. The `*.vfx.json` files under
 * `src/game/content/vfx/` are the *data*; this tuple is what `tsc` can check, and
 * `vfx-catalog.ts` cross-checks the two at load so a rename that touches only one
 * side fails loudly instead of leaving a dangling reference.
 *
 * A def's id **is** its filename: `rain` lives in `rain.vfx.json`. The loader
 * derives one from the other, so there is no third place to keep in step.
 *
 * @example
 * store.spawnBurst(VFX_IDS.rainSplash, x, y);
 */

/** Effect ids, in catalog order. */
export const VFX_DEF_IDS = ["rain", "rain-splash", "leaves"] as const;

export type VfxDefId = (typeof VFX_DEF_IDS)[number];

/** The named handles code uses, so no call site spells an id out. */
export const VFX_IDS = {
	/** Camera-tracked downpour, scaled by effective precipitation. */
	rain: "rain",
	/** Micro-burst a raindrop dies into. */
	rainSplash: "rain-splash",
	/** Wind-driven leaf drift authored onto trees. */
	leaves: "leaves",
} as const satisfies Readonly<Record<string, VfxDefId>>;
