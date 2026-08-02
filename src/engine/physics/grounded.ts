import type { RigidBody } from "./rigid-body";

/**
 * The named surface tests every mover asks of the world.
 *
 * They all reduce to {@link RigidBody.hasContactNormal} over a cone, and the
 * cone is the same width for all of them — the shared threshold is the point.
 * A wall and a floor differing in how steep they may be before they stop
 * counting is a gameplay decision, and it belongs here rather than as a `0.5`
 * repeated at each call site.
 */

/**
 * How closely a contact normal must line up with a direction to count, as the
 * cosine of the cone's half-angle. At `0.5` that is 60 degrees either way, so a
 * moderate slope still reads as ground.
 */
const SURFACE_COS = 0.5;

/** Whether `body` is resting on something below it. */
export const computeGrounded = (body: RigidBody): boolean =>
	body.hasContactNormal(0, 1, SURFACE_COS);

/**
 * Whether `body` is up against a wall on the given side.
 *
 * @param dir Positive to test the body's right, negative its left.
 */
export const touchingWall = (body: RigidBody, dir: number): boolean =>
	body.hasContactNormal(dir > 0 ? 1 : -1, 0, SURFACE_COS);
