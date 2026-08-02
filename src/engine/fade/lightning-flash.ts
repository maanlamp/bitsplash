import type { ReadonlyECS } from "../ecs";
import {
	FLASH_ENVELOPE,
	flashAlpha,
} from "../settings/flash-envelope";
import { playerSettings } from "../settings/player-settings";

/**
 * The lightning flash: a screen-space brightening on the fade path, and the
 * photosensitivity envelope it lives inside.
 *
 * It is deliberately **not** a VFX part. A flash is a property of the screen
 * rather than of the world, it must not be culled with the camera, and every
 * distinct VFX render slot costs a full-viewport render target — the allocation
 * is full at four, and a flash that consumed a fifth would be paying for a
 * render target to draw three quads.
 *
 * Its state is a module `WeakMap` keyed by the ECS, like the ambient clock: this
 * runs in the editor's live edit world, so a flash may not be an entity and may
 * not touch a serialized field.
 *
 * Every hard limit in {@link FLASH_ENVELOPE} is honoured here or at the strike
 * scheduler, whatever the player set:
 *
 * - **at most three flashes a second** — enforced by `LightningSystem`, which
 *   drops strikes rather than stacking them;
 * - **under a fifth of the screen** — {@link FLASH_SCREEN_AREA};
 * - **fade, never a hard cut** — both edges of {@link flashEnvelope} are at
 *   least `FLASH_ENVELOPE.minFadeSeconds` long;
 * - **no high-contrast white-on-black** — {@link FLASH_TINT} is a pale blue and
 *   peak alpha is `flashAlpha`, well short of opaque.
 *
 * The accessibility setting scales intensity *within* that envelope and can
 * never widen it, because {@link flashAlpha} is the only intensity-to-alpha
 * conversion and it clamps.
 */

/** Seconds the flash takes to reach its peak. */
const FLASH_ATTACK = Math.max(FLASH_ENVELOPE.minFadeSeconds, 0.05);

/** Seconds the flash takes to fall back to nothing. */
const FLASH_DECAY = 0.38;

/**
 * Fraction of the screen the flash covers, under the envelope's ceiling. It is
 * a band at the top of the frame rather than the whole screen: lightning lights
 * the sky, and a sky-shaped flash is both the correct look and the reason the
 * area stays legal.
 */
export const FLASH_SCREEN_AREA = 0.18;

/** How many bands the flash is drawn as, so it falls off downward. */
export const FLASH_BANDS = 3;

/** Pale blue-white. Never a saturated white over a dark frame. */
export const FLASH_TINT = [0.82, 0.88, 1] as const;

type FlashState = {
	/** Seconds since the flash was triggered. */
	age: number;
	/** Peak alpha this flash was granted, already inside the envelope. */
	peak: number;
};

const flashes = new WeakMap<ReadonlyECS, FlashState>();

/** Shape of the flash over its life, `0..1`. Fades in and out; never a cut. */
const flashEnvelope = (age: number): number => {
	if (age < 0) {
		return 0;
	}
	if (age < FLASH_ATTACK) {
		return age / FLASH_ATTACK;
	}
	const decayed = (age - FLASH_ATTACK) / FLASH_DECAY;
	return decayed >= 1 ? 0 : 1 - decayed;
};

/**
 * Start a flash at `brightness` (`0..1`, the strike's own strength after
 * distance).
 *
 * A strike arriving over a live flash takes the brighter of the two rather than
 * cutting the old one short, so overlapping strikes never produce a downward
 * step — the visual equivalent of the scheduler's rule that flashes thin rather
 * than stack.
 */
export const triggerLightningFlash = (
	ecs: ReadonlyECS,
	brightness: number,
): void => {
	const granted = flashAlpha(
		playerSettings.flashIntensity * brightness,
	);
	const live = flashes.get(ecs);
	const peak = Math.max(
		granted,
		live ? live.peak * flashEnvelope(live.age) : 0,
	);
	if (peak <= 0) {
		return;
	}
	flashes.set(ecs, { age: 0, peak });
};

/** Advance a world's flash. Called once a frame by `LightningFlashSystem`. */
export const advanceLightningFlash = (
	ecs: ReadonlyECS,
	dt: number,
): void => {
	const live = flashes.get(ecs);
	if (!live) {
		return;
	}
	live.age += dt;
	if (live.age >= FLASH_ATTACK + FLASH_DECAY) {
		flashes.delete(ecs);
	}
};

/**
 * The flash overlay's current alpha, `0` when nothing is flashing.
 *
 * @example
 * const alpha = lightningFlashAlpha(ecs);
 */
export const lightningFlashAlpha = (ecs: ReadonlyECS): number => {
	const live = flashes.get(ecs);
	return live ? live.peak * flashEnvelope(live.age) : 0;
};
