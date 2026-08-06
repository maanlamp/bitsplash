import type { Seconds } from "../../engine/duration";
import { profiler } from "../../engine/profiling/profiler";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import Vector2 from "../../engine/vector2";
import { PlayerInputComponent } from "../player/player-input-component";
import { HITSPLAT_POOL_SIZE } from "./hitsplat-hud";
import { HitsplatComponent } from "./hitsplat-component";

const TEXTS = ["7", "12", "23", "48", "116", "301", "1024"];
const FLAVOURS = ["CRIT", "SMASH", "REND"];

/**
 * Keeps the hitsplat pool saturated, to put the HUD under a repeatable load.
 *
 * Driving real combat instead would mean scripting a fight, and two runs would
 * then differ in how many hits landed and when. The HUD reads
 * `ecs.query(HitsplatComponent)`, so spawning those entities directly gives it the
 * same work every run without depending on combat at all.
 *
 * Pairs with `scripts/frame-trace.ts`: saturate the pool, then read presented
 * frames. That combination is what measured the HUD at 732 presented fps.
 *
 * Dev-only. `createHudSystems` constructs it solely when `?hitsplatstorm` is on
 * the page URL, so nothing spawns on a normal launch.
 */
@profiler("Hitsplat storm", "HUD")
export class HitsplatStormSystem implements UpdateSystem {
	private seed = 1;

	constructor(
		private readonly target: number = HITSPLAT_POOL_SIZE,
		/** Spawn field width around the player, in world units. */
		private readonly spread: number = 160,
	) {}

	/** Deterministic, so two runs present the same positions and text. */
	private random(): number {
		this.seed = (this.seed * 1664525 + 1013904223) % 0x100000000;
		return this.seed / 0x100000000;
	}

	update({ ecs }: UpdateContext): void {
		// Around the player, or nothing would be on screen to draw and both HUDs
		// would cull the entire load.
		const player = ecs.queryFirst(PlayerInputComponent);
		const transform = player
			? ecs.getComponent(player[0], TransformComponent)
			: undefined;
		if (!transform) {
			return;
		}
		const origin = transform.position;
		const live = ecs.query(HitsplatComponent).length;
		for (let i = live; i < this.target; i++) {
			const crit = this.random() < 0.4;
			ecs.createEntity([
				new HitsplatComponent(
					TEXTS[Math.floor(this.random() * TEXTS.length)]!,
					crit
						? FLAVOURS[Math.floor(this.random() * FLAVOURS.length)]!
						: null,
					crit,
					this.random() < 0.15,
					new Vector2(
						origin.x + (this.random() - 0.5) * this.spread,
						origin.y + (this.random() - 0.5) * this.spread * 0.5,
					),
					new Vector2((this.random() - 0.5) * 20, -30),
					(0.6 + this.random() * 0.6) as Seconds,
				),
			]);
		}
	}
}
