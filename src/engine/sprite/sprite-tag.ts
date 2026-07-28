declare const SPRITE_TAG_BRAND: unique symbol;

/**
 * The name of a tag inside a `.bsprite` archive — a playback unit
 * ({@link import("./bsprite-manifest").BspriteTag}) selected by
 * `SpriteComponent.current` or cropped through `SpriteAsset.contentRect`.
 *
 * Branded so a tag can only be obtained from the generated accessor module
 * (`src/game/content/assets/assets.gen.ts`, written by `scripts/gen-assets.ts`),
 * never typed as a bare literal at a call site. A tag that no longer exists in
 * the archive therefore fails at `bun run gen` and `tsc`, rather than resolving
 * to the full-canvas fallback rect and rendering a wrong crop.
 */
export type SpriteTag = string & {
	readonly [SPRITE_TAG_BRAND]: true;
};

/**
 * Brand a raw tag name. Intended for the generated accessor module, which is the
 * only place that knows a tag really exists.
 */
export const asSpriteTag = (name: string): SpriteTag =>
	name as SpriteTag;
