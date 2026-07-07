import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
import { StateMachineComponent } from "../../engine/fsm/state-machine-component";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { TransformComponent } from "../../engine/transform-component";
import { FontSettings } from "../../engine/text/font-settings";
import { resolveFont } from "../../engine/text/resolve-font";
import type { DebugFlags } from "../debug-flags";

export class AiStateDebugSystem implements RenderSystem {
	private readonly font = new FontSettings();

	constructor(
		private readonly flags: DebugFlags,
		private readonly layer: number,
	) {}

	render(ctx: RenderContext): void {
		if (!this.flags.get("aiState")) {
			return;
		}
		const font = resolveFont(this.font, ctx.assetManager);
		if (!font) {
			return;
		}
		const zoom = pickActiveCamera2D(ctx.ecs)?.zoom ?? 1;
		for (const [id, sm, perception, transform] of ctx.ecs.query(
			StateMachineComponent,
			PerceptionComponent,
			TransformComponent,
		)) {
			const state = sm.current || sm.def?.initial || "patrol";
			const pct = Math.round(perception.detection * 100);
			const phys = ctx.ecs.getComponent(id, PhysicsBodyComponent);
			const top =
				transform.position.y -
				(phys?.body ? phys.halfExtents.y : 0) -
				10 / zoom;
			ctx.renderer.drawText(
				this.layer,
				font,
				`${state} ${pct}%`,
				transform.position.x,
				top,
				{
					align: "center",
					color: [1, 1, 1, 1],
					outline: [0, 0, 0, 1],
				},
			);
		}
	}
}
