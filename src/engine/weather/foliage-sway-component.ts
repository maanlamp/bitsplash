import type { Seconds } from "../duration";
import type { EntityId } from "../ecs";
import { hashUnit } from "../noise";
import { quantizeToTexel } from "../render/quantize";
import type { SwayParams } from "../render/renderer-2d";
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
 * Opt-in marker: this sprite bends with the wind.
 *
 * Sway is presentation only — nothing here is read by simulation, and the
 * component carries no run-state, because the bend is a pure function of the
 * ambient clock, the entity id and the sampled wind. Wind is sampled
 * indoor-masked, so a marked sprite stills inside without knowing what `indoor`
 * means, and freezes with the ambient clock while the host is paused.
 *
 * The fields are the bend program's uniforms: a height power curve carrying the
 * trunk bend, and a high-frequency term on a much tighter power of the same
 * gradient for the leaf flutter, so the crown rustles and the trunk does not.
 * Wind-weight masks — only this branch moves — remain roadmap, and would read
 * the same amplitude.
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
	 * drawn height. `0.3` on a 64px tree is a ~19px lean at full gale, which is
	 * what a storm reads as against the retuned rain; `0` disables the bend
	 * without removing the marker.
	 *
	 * The authored value is the instance's centre — each entity jitters around
	 * it by up to ±35%, hashed from its id, so a copy-pasted hedgerow does not
	 * move as one board.
	 */
	@serialize() amplitude = 0.3;

	/**
	 * How sharply the travel concentrates toward the free edge. `1` is a plain
	 * shear, every row leaning in proportion to its height; `2` is a trunk that
	 * barely moves under a crown that does. Must be greater than zero.
	 */
	@serialize() curve = 2.4;

	/**
	 * Free-edge travel of the leaf flutter riding on top of the bend, as a
	 * fraction of drawn height at unit wind. Small by design: `0.03` on a 64px
	 * tree is under two art pixels at full gale, and anything below half an art
	 * pixel quantizes away, which is what keeps a breeze from wobbling.
	 *
	 * Scaled by the **square** of the wind, unlike the linear bend, so the
	 * flutter recedes faster than the lean does and never dominates a
	 * near-still tree. `0` leaves a pure bend.
	 */
	@serialize() rustle = 0.03;

	/** Flutter oscillations per second. */
	@serialize() rustleFrequency = 1.8;

	/**
	 * Seconds of extra clock offset for this instance, on top of the per-entity
	 * spread hashed from its id. Author it only to deliberately pair or oppose
	 * two sprites; the hashed spread already decorrelates neighbours.
	 */
	@serialize() phase = 0;

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
 * const wind = sampleWind(ecs, position.x, position.y, t);
 */
export const foliageSwayPhase = (entity: EntityId): Seconds =>
	(hashUnit(idSeed(entity), PHASE_SALT) *
		FOLIAGE_PHASE_SPREAD) as Seconds;

/** What {@link foliageSwayShear} needs to place one instance's lean. */
type FoliageSwayInput = Readonly<{
	entity: EntityId;
	/** Signed wind, already sampled at this instance's phase. */
	wind: number;
	/** Drawn height in world units (`source.height * scale.y`). */
	height: number;
	/** The instance's authored {@link FoliageSwayComponent.amplitude}. */
	amplitude: number;
	/** Width of one of the sprite's own art pixels, in world units. */
	artPixel: number;
}>;

/**
 * Fraction of its authored amplitude this instance actually travels: `1` plus
 * up to ±{@link AMPLITUDE_JITTER}, hashed from the id so a copy-pasted
 * hedgerow does not move as one board.
 */
const amplitudeJitter = (entity: EntityId): number =>
	1 +
	(hashUnit(idSeed(entity), AMPLITUDE_SALT) * 2 - 1) *
		AMPLITUDE_JITTER;

/**
 * Signed world-unit travel of a swaying sprite's free edge: the sampled wind
 * times the drawn height times the authored amplitude, jittered per-instance
 * and snapped to a whole **art pixel** — one of the sprite's own texels as
 * drawn — so the lean is measured in the same units the art is painted in
 * rather than in screen texels, which at any upscale above 1 are finer.
 *
 * Pure and frame-independent — the render system supplies the wind. Calm or
 * indoor wind is `0`, and so is a zero amplitude, so an unmoving sprite costs
 * nothing downstream.
 *
 * @example
 * const lean = foliageSwayShear({ entity: id, wind, height, amplitude: sway.amplitude, artPixel: scale.x });
 */
const foliageSwayShear = ({
	entity,
	wind,
	height,
	amplitude,
	artPixel,
}: FoliageSwayInput): number => {
	const travel = wind * height * amplitude * amplitudeJitter(entity);
	return artPixel > 0
		? quantizeToTexel(travel, 1 / artPixel)
		: travel;
};

/** One instance's state for the frame being drawn. */
export type FoliageSwayFrame = Readonly<{
	entity: EntityId;
	sway: FoliageSwayComponent;
	/** Signed wind, already sampled at this instance's phase. */
	wind: number;
	/** Drawn height in world units (`source.height * scale.y`). */
	height: number;
	/** Width of one of the sprite's own art pixels, in world units. */
	artPixel: number;
	/** Ambient clock, unshifted — the phase offset is added here. */
	time: Seconds;
}>;

/**
 * Resolve an instance into the bend the renderer draws.
 *
 * The flutter rides the **square** of the wind while the lean rides it
 * linearly, so it falls away four times as fast: at half wind the lean is half
 * its gale travel but the flutter is a quarter of its own, which is what stops
 * it dominating a barely-moving tree. It is left unquantized here because the
 * fragment stage lands the combined displacement on an art pixel, and a flutter
 * under half a pixel is meant to disappear entirely.
 *
 * @example
 * renderer.drawSwayImage(layer, image, { ...rect, sway: foliageSwayParams(frame) });
 */
export const foliageSwayParams = ({
	entity,
	sway,
	wind,
	height,
	artPixel,
	time,
}: FoliageSwayFrame): SwayParams => ({
	lean: foliageSwayShear({
		entity,
		wind,
		height,
		amplitude: sway.amplitude,
		artPixel,
	}),
	rustle:
		wind * wind * height * sway.rustle * amplitudeJitter(entity),
	curve: sway.curve,
	rustleFrequency: sway.rustleFrequency,
	phase: foliageSwayPhase(entity) + sway.phase,
	time,
	pinnedBase: sway.pinnedBase,
});
