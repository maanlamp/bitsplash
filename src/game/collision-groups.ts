/**
 * Fixtures sharing the same negative planck group index never collide. The
 * player and pickups share this group so items pass through the player (they
 * still collide with terrain, which sits in the default group 0).
 */
export const PASSTHROUGH_GROUP = -1;
