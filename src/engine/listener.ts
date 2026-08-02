import type { Camera2D } from "./camera/camera-2d";
import { pickActiveCamera2D } from "./camera/camera-2d-render";
import type { ReadonlyECS } from "./ecs";
import { TILE_SIZE } from "./tilemap/tile";

/**
 * Where the ear is, and how far everything is from it.
 *
 * The engine has no listener concept of its own, so every system that places a
 * sound or dims an effect by distance used to resolve the camera itself and
 * invent its own falloff. They all go through here instead: one metre
 * convention, one listener, one distance, one level curve. A change to how
 * distance sounds is a change in this file, not in five.
 *
 * The third dimension is the camera's **standoff from the world plane**, which
 * is what zoom actually is in a 2D game: zooming out is the camera pulling back,
 * so a wide shot must sound further away than a close one even though nothing in
 * the world moved. Without it, zooming out showed more rain and therefore
 * sounded *heavier*, which is backwards — and a lightning bolt at the centre of
 * a fully zoomed-out frame read as striking at the listener's feet.
 */

/**
 * How many world units make a metre.
 *
 * Almost nothing needs a physical scale — a platformer's gravity and speeds are
 * tuned by feel, not by SI. Sound is the exception: the speed of sound, air
 * absorption and level falloff are all stated in metres. One tile reads as a
 * metre, which puts a two-tile character at two metres.
 */
const WORLD_UNITS_PER_METRE = TILE_SIZE;

/** World units for a distance in metres. */
export const metres = (value: number): number =>
	value * WORLD_UNITS_PER_METRE;

/** Metres for a distance in world units. */
export const metresOf = (worldUnits: number): number =>
	worldUnits / WORLD_UNITS_PER_METRE;

/**
 * The zoom the world is authored to sound at — the camera's default. At this
 * zoom the camera sits on the world plane and nothing is pushed away.
 */
const REFERENCE_ZOOM = 3;

/**
 * Metres the camera pulls back for each halving of zoom below
 * {@link REFERENCE_ZOOM}.
 *
 * The camera's own bounds are `0.25..16`, so a full zoom-out is twelve times the
 * reference distance and lands the listener a few hundred metres off the plane —
 * far enough that rain hitting the ground is barely there, which is the point.
 */
const STANDOFF_SPAN_METRES = 30;

/** Distance in metres at which a sound is at half level, unless overridden. */
const HALF_LEVEL_METRES = 700;

/** The ear's position: a point on the world plane, plus the camera's standoff. */
export type Listener = Readonly<{
	x: number;
	y: number;
	/** Camera standoff from the world plane, in world units. Zero when close. */
	z: number;
}>;

/**
 * Resolve the listener for this frame: the active camera, falling back to a
 * query and then to the world origin.
 *
 * @example
 * const listener = listenerAt(ecs, ctx.camera);
 */
export const listenerAt = (
	ecs: ReadonlyECS,
	camera: Camera2D | null | undefined,
): Listener => {
	const active = camera ?? pickActiveCamera2D(ecs);
	const position = active?.position ?? null;
	const zoom = active?.zoom;
	const standoff =
		zoom === undefined || !(zoom > 0)
			? 0
			: Math.max(0, REFERENCE_ZOOM / zoom - 1) *
				metres(STANDOFF_SPAN_METRES);
	return { x: position?.x ?? 0, y: position?.y ?? 0, z: standoff };
};

/**
 * Distance in metres from the listener to a point on the world plane, through
 * the camera's standoff.
 *
 * @example
 * const away = distanceMetresTo(listener, strike.x, strike.y);
 */
export const distanceMetresTo = (
	listener: Listener,
	x: number,
	y: number,
): number =>
	metresOf(Math.hypot(x - listener.x, y - listener.y, listener.z));

/**
 * How much of a sound survives the trip to the listener, `0..1`.
 *
 * Thunder's level and the lightning flash's brightness ride this at the default
 * half-distance on purpose — a bolt that sounds distant must look distant.
 * Near-field ambience passes a much shorter `halfLevelMetres`, because rain on
 * the ground is inaudible from a few hundred metres up while thunder is not.
 *
 * @example
 * const gain = base * distanceLevel(distanceMetresTo(listener, x, y));
 */
export const distanceLevel = (
	metresAway: number,
	halfLevelMetres: number = HALF_LEVEL_METRES,
): number =>
	halfLevelMetres / (Math.max(0, metresAway) + halfLevelMetres);
