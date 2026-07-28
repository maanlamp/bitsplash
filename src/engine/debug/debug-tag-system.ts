import { PhysicsBodyComponent } from "../physics/physics-body-component";
import { entityTop } from "../sprite/entity-top";
import { TransformComponent } from "../transform-component";
import { resolveFont } from "../text/resolve-font";
import { type RenderContext, RenderSystem } from "../system";
import { DebugTagComponent } from "../debug/debug-tag-component";
import { resolveRenderLayer } from "../render/render-layers";

const GAP = 4;

export class DebugTagSystem implements RenderSystem {
	private layer: string;

	constructor(layer: string) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		for (const [id, transform, tag] of ecs.query(
			TransformComponent,
			DebugTagComponent,
		)) {
			const font = resolveFont(tag.font, assetManager);
			if (!font) {
				return;
			}
			const phys = ecs.getComponent(id, PhysicsBodyComponent);
			const top =
				entityTop(ecs, assetManager, id, GAP) ??
				transform.position.y -
					(phys?.body ? phys.halfExtents.y : 0) -
					GAP;

			renderer.drawText(
				resolveRenderLayer(ecs, this.layer),
				font,
				tag.label,
				transform.position.x,
				top,
				{
					align: "center",
					color: [1, 1, 1, 1],
					outline: [0, 0, 0, 1],
					bold: tag.font.variant.includes("Bold"),
					italic: tag.font.variant.includes("Italic"),
				},
			);
		}
	}
}
