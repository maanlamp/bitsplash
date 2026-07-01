import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { TransformComponent } from "../../engine/transform-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { HealthComponent } from "../health/health-component";
import { HealthBarStateComponent } from "../health/health-bar-state-component";
import { fadeAlpha, withAlpha } from "../fade";

const FADE = 1;

export default class HealthRenderSystem implements RenderSystem {
	constructor(private layer: number) {}

	render({ ecs, renderer }: RenderContext) {
		for (const [id, health, transform, rb] of ecs.query(
			HealthComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			const bar = ecs.getComponent(id, HealthBarStateComponent);
			if (!bar || bar.visible <= 0 || !rb.body) {
				continue;
			}
			const alpha = fadeAlpha(bar.visible, FADE);
			const ox = transform.position.x - 16;
			const oy = transform.position.y + rb.halfExtents.y * -2 - 4;
			const pct = Math.floor((health.hp / health.maxHp) * 100);
			const color = `color-mix(in oklch, lime ${pct}%, red)`;
			renderer.drawRect(this.layer, {
				x: ox - 1,
				y: oy - 1,
				width: 34,
				height: 6,
				fill: withAlpha(
					`color-mix(in oklch, ${color}, black 50%)`,
					alpha,
				),
			});
			renderer.drawRect(this.layer, {
				x: ox,
				y: oy,
				width: Math.ceil((32 / health.maxHp) * bar.displayed),
				height: 4,
				fill: withAlpha([1, 1, 1, 0.7], alpha),
			});
			renderer.drawRect(this.layer, {
				x: ox,
				y: oy,
				width: Math.ceil((32 / health.maxHp) * health.hp),
				height: 4,
				fill: withAlpha(color, alpha),
			});
		}
	}
}
