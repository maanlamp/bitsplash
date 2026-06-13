import { PhysicsBodyComponent } from "../../engine/components/physics-body";
import { TransformComponent } from "../../engine/components/transform";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { HealthBarComponent } from "../components/health-bar";
import { HealthComponent } from "../components/health";
import { fadeAlpha, withAlpha } from "../fade";

const FADE = 1;

export default class HealthRenderSystem implements RenderSystem {
	constructor(private layer: number) {}

	render({ ecs, renderer }: RenderContext) {
		for (const [id, health, transform, body] of ecs.query(
			HealthComponent,
			TransformComponent,
			PhysicsBodyComponent,
		)) {
			const bar = ecs.getComponent(id, HealthBarComponent);
			if (!bar || bar.visible <= 0) {
				continue;
			}
			const alpha = fadeAlpha(bar.visible, FADE);
			const ox = transform.position.x - 16;
			const oy = transform.position.y + body.halfHeight * -2 - 4;
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
