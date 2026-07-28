import type AssetManager from "../../engine/assets";
import { entityTop } from "../../engine/sprite/entity-top";
import { TransformComponent } from "../../engine/transform-component";
import type { ECS, EntityId } from "../../engine/ecs";
import type { Seconds } from "../../engine/duration";
import {
	type UpdateContext,
	UpdateSystem,
} from "../../engine/system";
import Vector2 from "../../engine/vector2";
import { HealthComponent } from "../health/health-component";
import { PlayerInputComponent } from "../player/player-input-component";
import { DamageEvent } from "../events";
import flavourContent from "../content/hitsplats/flavour.json";
import { HitsplatComponent } from "./hitsplat-component";
import { HitsplatStyleComponent } from "./hitsplat-style-component";
import { profiler } from "../../engine/profiling/profiler";

const FLAVOUR = flavourContent as Record<string, readonly string[]>;
const CRIT_LAUNCH_SCALE = 1.35;
const SPAWN_MARGIN = 4;

@profiler("Hitsplat spawn", "Combat")
export class HitsplatSpawnSystem implements UpdateSystem {
	update({ ecs, events, assetManager }: UpdateContext): void {
		const damage = events.read(DamageEvent);
		if (damage.length === 0) {
			return;
		}
		const styleEntry = ecs.query(HitsplatStyleComponent)[0];
		if (!styleEntry) {
			return;
		}
		const style = styleEntry[1];
		const playerEntry = ecs.query(PlayerInputComponent)[0];
		const playerId = playerEntry ? playerEntry[0] : null;
		for (const event of damage) {
			if (!ecs.getComponent(event.target, HealthComponent)) {
				continue;
			}
			this.spawn(ecs, assetManager, style, event, playerId);
		}
	}

	private spawn(
		ecs: ECS,
		assetManager: AssetManager,
		style: HitsplatStyleComponent,
		event: DamageEvent,
		playerId: EntityId | null,
	): void {
		const transform = ecs.getComponent(
			event.target,
			TransformComponent,
		);
		if (!transform) {
			return;
		}
		const position = new Vector2(
			transform.position.x,
			entityTop(ecs, assetManager, event.target, SPAWN_MARGIN) ??
				transform.position.y - SPAWN_MARGIN,
		);

		const { text, flavour } = this.describe(style, event);
		const lifetime = (
			event.crit
				? style.lifetime.seconds + style.critLifetimeBonus.seconds
				: style.lifetime.seconds
		) as Seconds;
		const velocity = this.launch(
			ecs,
			style,
			event,
			transform.position,
		);

		ecs.createEntity([
			new TransformComponent(position),
			new HitsplatComponent(
				text,
				flavour,
				event.crit,
				event.target === playerId,
				velocity,
				lifetime,
			),
		]);
	}

	private describe(
		style: HitsplatStyleComponent,
		event: DamageEvent,
	): { text: string; flavour: string | null } {
		const text = this.format(style, event.amount);
		if (text === style.blockedText || !event.crit) {
			return { text, flavour: null };
		}
		return { text, flavour: this.flavourWord(event.flavourSet) };
	}

	private format(
		style: HitsplatStyleComponent,
		amount: number,
	): string {
		const rounded = Math.round(amount);
		if (rounded <= 0) {
			return style.blockedText;
		}
		return String(rounded);
	}

	private flavourWord(flavourSet: string): string | null {
		const words = FLAVOUR[flavourSet] ?? FLAVOUR.default;
		if (!words || words.length === 0) {
			return null;
		}
		return words[Math.floor(Math.random() * words.length)] ?? null;
	}

	private launch(
		ecs: ECS,
		style: HitsplatStyleComponent,
		event: DamageEvent,
		targetPosition: Vector2,
	): Vector2 {
		const speedRange = style.launchSpeedMax - style.launchSpeedMin;
		let speed = style.launchSpeedMin + Math.random() * speedRange;
		if (event.crit) {
			speed *= CRIT_LAUNCH_SCALE;
		}
		const angleRange =
			style.launchAngleMax.radians - style.launchAngleMin.radians;
		const angle =
			style.launchAngleMin.radians + Math.random() * angleRange;
		const sign = this.launchSign(ecs, event.source, targetPosition);
		return new Vector2(
			Math.cos(angle) * sign * speed,
			-Math.sin(angle) * speed,
		);
	}

	private launchSign(
		ecs: ECS,
		source: EntityId | null,
		targetPosition: Vector2,
	): number {
		if (source) {
			const sourceTransform = ecs.getComponent(
				source,
				TransformComponent,
			);
			if (sourceTransform) {
				return targetPosition.x >= sourceTransform.position.x
					? 1
					: -1;
			}
		}
		return Math.random() < 0.5 ? -1 : 1;
	}
}
