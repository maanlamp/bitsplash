import { pickActiveCamera2D } from "../../engine/camera/camera-2d-render";
import { AiStateComponent } from "../../engine/debug/ai-state-component";
import { PerceptionComponent } from "../../engine/perception/perception-component";
import { PhysicsBodyComponent } from "../../engine/physics/physics-body-component";
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
		for (const [id, perception, transform] of ctx.ecs.query(
			PerceptionComponent,
			TransformComponent,
		)) {
			const state =
				ctx.ecs.getComponent(id, AiStateComponent)?.state ?? "";
			const pct = Math.round(perception.detection * 100);
			const label = state ? `${state} ${pct}%` : `${pct}%`;
			const phys = ctx.ecs.getComponent(id, PhysicsBodyComponent);
			const top =
				transform.position.y -
				(phys?.body ? phys.halfExtents.y : 0) -
				10 / zoom;
			ctx.renderer.drawText(
				this.layer,
				font,
				label,
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
