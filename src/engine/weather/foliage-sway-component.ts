import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { hashUnit } from "../noise";
import { quantizeToTexel } from "../render/quantize";
import {
	serializable,
	serialize,
} from "../serialization/serializable";

const PHASE_SALT = 0x4c3a_f21d;
const AMPLITUDE_SALT = 0x1b7d_9e05;

/**
 * Seconds of ambient clock a sway instance's phase may be shifted by. Wider
 * than a gust cell (~2 s), so neighbours sit on unrelated parts of the signal
 * rather than merely offset within one squall.
 */
export const FOLIAGE_PHASE_SPREAD = 4;

/** Fraction of its authored amplitude an instance may deviate by, either way. */
const AMPLITUDE_JITTER = 0.35;

/**
 * Opt-in marker: this sprite leans with the wind.
 *
 * Sway is presentation only — nothing here is read by simulation, and the
 * component carries no run-state, because the lean is a pure function of the
 * ambient clock, the entity id and the sampled wind. Wind is sampled
 * indoor-masked, so a marked sprite stills inside without knowing what `indoor`
 * means, and freezes with the ambient clock while the host is paused.
 *
 * v1 shears the whole sprite. Wind-weight masks (only the canopy moves) and
 * per-row displacement are roadmap, not schema — they will read the same
 * amplitude.
 *
 * @example
 * ```ts
 * const sway = new FoliageSwayComponent();
 * sway.amplitude = 0.25;
 * ecs.addComponent(tree, sway);
 * ```
 */
@serializable("FoliageSway")
export class FoliageSwayComponent {
	/**
	 * How far the free edge travels at unit wind, as a fraction of the sprite's
	 * drawn height. `0.15` on a 64px tree is a ~10px lean at full gale; `0`
	 * disables the sway without removing the marker.
	 *
	 * The authored value is the instance's centre — each entity jitters around
	 * it by up to ±35%, hashed from its id, so a copy-pasted hedgerow does not
	 * move as one board.
	 */
	@serialize() amplitude = 0.15;

	/**
	 * Whether the sprite is rooted at its bottom edge (the default: trees,
	 * bushes, grass). Clear it for foliage that hangs from its top edge —
	 * vines, moss, creepers — which pins the top and swings the bottom instead.
	 */
	@serialize() pinnedBase = true;
}

/**
 * Fold an entity id (a UUID string) into an int32 the integer hashes can key
 * off. Cheap and order-dependent, which is all a decorrelation seed needs.
 */
const idSeed = (entity: EntityId): number => {
	let seed = 0;
	for (let i = 0; i < entity.length; i++) {
		seed = (Math.imul(seed, 31) + entity.charCodeAt(i)) | 0;
	}
	return seed;
};

/**
 * Per-instance offset into the ambient clock, `[0, FOLIAGE_PHASE_SPREAD)`
 * seconds. Add it to the time you sample the wind at so two sprites side by
 * side ride different points of the same gust.
 *
 * @example
 * const t = (ambientTime(ecs) + foliageSwayPhase(id)) as Seconds;
 * const wind = sampleWind(ecs, transform.position.x, t);
 */
export const foliageSwayPhase = (entity: EntityId): Seconds =>
	(hashUnit(idSeed(entity), PHASE_SALT) *
		FOLIAGE_PHASE_SPREAD) as Seconds;

/** What {@link foliageSwayShear} needs to place one instance's lean. */
export type FoliageSwayInput = Readonly<{
	entity: EntityId;
	/** Signed wind, already sampled at this instance's phase. */
	wind: number;
	/** Drawn height in world units (`source.height * scale.y`). */
	height: number;
	/** The instance's authored {@link FoliageSwayComponent.amplitude}. */
	amplitude: number;
	/** World→device pixel scale of the active camera; `1` with no camera. */
	zoom: number;
}>;

/**
 * Signed world-unit displacement of a swaying sprite's free edge: the sampled
 * wind times the drawn height times the authored amplitude, jittered
 * per-instance and snapped to a whole screen texel so a pixel-art edge never
 * samples between texels.
 *
 * Pure and frame-independent — the render system supplies the wind, the caller
 * decides which edge is pinned. Calm or indoor wind is `0`, and so is a zero
 * amplitude, so an unmoving sprite costs nothing downstream.
 *
 * @example
 * const lean = foliageSwayShear({ entity: id, wind, height, amplitude: sway.amplitude, zoom });
 * renderer.drawImage(layer, image, { ...rect, shear: lean });
 */
export const foliageSwayShear = ({
	entity,
	wind,
	height,
	amplitude,
	zoom,
}: FoliageSwayInput): number => {
	const jitter =
		1 +
		(hashUnit(idSeed(entity), AMPLITUDE_SALT) * 2 - 1) *
			AMPLITUDE_JITTER;
	const lean = quantizeToTexel(
		wind * height * amplitude * jitter,
		zoom,
	);
	return lean === 0 ? 0 : lean;
};

/**
 * Negation that keeps a zero positive, so a still sprite's offsets are plain
 * zeros rather than the `-0` a signed calm wind would otherwise carry through.
 */
const negate = (value: number): number => (value === 0 ? 0 : -value);

/**
 * The two `drawImage` fields a sway costs: a whole-quad `offsetX` and the
 * top-corner `shear`.
 *
 * Both are the same quantized magnitude, so whichever edge is pinned lands
 * exactly on `transform.position.x` and the other exactly one texel grid step
 * away — no half-texel drift from splitting the lean.
 */
export type FoliageSwayOffsets = Readonly<{
	offsetX: number;
	shear: number;
}>;

/** A still sprite: the shared no-sway result, so the common path allocates nothing. */
export const FOLIAGE_SWAY_STILL: FoliageSwayOffsets = Object.freeze({
	offsetX: 0,
	shear: 0,
});

/**
 * Resolve a lean into quad offsets against the pinned edge.
 *
 * A base-pinned sprite shears its top corners and leaves the quad where it is,
 * so the trunk stays planted. A top-pinned one translates by the lean and
 * shears back by it, which moves the bottom edge alone — the same shape upside
 * down, and still exactly texel-aligned because one magnitude does both jobs.
 *
 * @example
 * const { offsetX, shear } = foliageSwayOffsets(input, sway.pinnedBase);
 * renderer.drawImage(layer, image, { x: transform.position.x + offsetX, shear, ... });
 */
export const foliageSwayOffsets = (
	input: FoliageSwayInput,
	pinnedBase: boolean,
): FoliageSwayOffsets => {
	const lean = foliageSwayShear(input);
	return pinnedBase
		? { offsetX: 0, shear: lean }
		: { offsetX: lean, shear: negate(lean) };
};
