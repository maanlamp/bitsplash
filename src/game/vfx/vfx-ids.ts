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
export const VFX_DEF_IDS = [
	"rain",
	"rain-heavy",
	"rain-splash",
	"snow",
	"sand",
	"wind-lines",
	"leaves",
	"fire",
	"blood",
	"loot-beam-common",
	"loot-beam-uncommon",
	"loot-beam-rare",
	"loot-beam-epic",
	"loot-beam-unique",
] as const;

export type VfxDefId = (typeof VFX_DEF_IDS)[number];

/** The named handles code uses, so no call site spells an id out. */
export const VFX_IDS = {
	/** Camera-tracked downpour, scaled by the `rain` channel. */
	rain: "rain",
	/**
	 * The storm's rain: fatter, faster, near-opaque streaks over the base fall.
	 *
	 * It is selected by the weather rather than by a preset naming it —
	 * `rain × wind` gates it, so a windless shower leaves it almost dark and a
	 * gale with the same rain scalar brings it up. A scene wanting storm rain
	 * hosts this emitter beside the base one; both are authored residents.
	 */
	rainHeavy: "rain-heavy",
	/** Micro-burst a raindrop dies into. */
	rainSplash: "rain-splash",
	/** Camera-tracked snowfall, scaled by the `snow` channel. */
	snow: "snow",
	/** Camera-tracked blown sand, scaled by the `sand` channel. */
	sand: "sand",
	/** Wind-line ribbons, absent in a breeze and prominent in a gale. */
	windLines: "wind-lines",
	/** Wind-driven leaf drift authored onto trees. */
	leaves: "leaves",
	/**
	 * A campfire: untextured additive quads on a colour-over-life ramp, plus
	 * embers and normal-blend smoke wisps. There is no flame spritesheet — the
	 * shape comes from the ramp, the buoyant gravity, and the size tracks.
	 */
	fire: "fire",
	/**
	 * One-shot spurt off a hit: gravity-arced droplets that raycast their own
	 * move segment and die on the first surface, leaving an oriented smear that
	 * pins to terrain or rides the body it landed on.
	 */
	blood: "blood",
	/**
	 * The loot beams, one per visual class and escalating with it: a pulsing
	 * column of light plus rising motes, which Epic and Unique wrap in an
	 * orbiting helix.
	 *
	 * Nothing spells these out at a call site — `spawnLootBeam` maps a visual
	 * class onto them, and that mapping is the only consumer.
	 */
	lootBeamCommon: "loot-beam-common",
	lootBeamUncommon: "loot-beam-uncommon",
	lootBeamRare: "loot-beam-rare",
	lootBeamEpic: "loot-beam-epic",
	lootBeamUnique: "loot-beam-unique",
} as const satisfies Readonly<Record<string, VfxDefId>>;
