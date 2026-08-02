/**
 * A lightning strike, published on the world event bus the frame it happens.
 *
 * **The event is the seam.** Everything a strike causes is a subscriber: the
 * bolt, the screen flash, the impact burst, thunder. Nothing about damage,
 * gameplay or scoring lives in the engine — a game-layer subscriber can be added
 * later with no engine change, which is the whole reason this is an event rather
 * than a call into the things it drives.
 *
 * The event is **complete**: `seed` plus the impact point regenerate the bolt
 * exactly (`generateBolt`), so a consumer that arrives late, or a test, can
 * reconstruct the strike without asking the scheduler what it drew.
 *
 * @example
 * for (const strike of ctx.events.read(LightningStrikeEvent)) {
 * 	triggerLightningFlash(ctx.ecs, strike.intensity);
 * }
 * @example
 * const bolt = generateBolt(e.seed, e.skyX, e.skyY, e.x, e.y);
 */
export class LightningStrikeEvent {
	constructor(
		/** Impact point, world units. */
		readonly x: number,
		readonly y: number,
		/** Where the bolt enters the frame, world units; above and beside the impact. */
		readonly skyX: number,
		readonly skyY: number,
		/** How hard the strike is, `0..1`. Drives flash, bolt and thunder level. */
		readonly intensity: number,
		/** Bolt seed. The same seed always regenerates the same geometry. */
		readonly seed: number,
		/** Ambient seconds at the moment of the strike. */
		readonly time: number,
	) {}
}
