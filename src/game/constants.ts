import { TILE_SIZE } from "../engine/tile";

export const GRAVITY = { x: 0, y: 20 * TILE_SIZE } as const;

export const PICKUP_MAGNET_MIN_SPEED = 5 * TILE_SIZE;
export const PICKUP_MAGNET_MAX_SPEED = 14 * TILE_SIZE;
export const PICKUP_MAGNET_RADIUS = 1 * TILE_SIZE;
export const PICKUP_RADIUS = 0.25 * TILE_SIZE;
