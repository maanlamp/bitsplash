import { RigidbodyComponent } from "../../engine/components/rigidbody";
import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { DebugTagComponent } from "../components/debug-tag";

export class DebugTagSystem implements RenderSystem {
	private layer: number;

	constructor(layer: number) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		for (const [id, transform, tag] of ecs.query(
			TransformComponent,
			DebugTagComponent,
		)) {
			const families = assetManager.getFontFamilies(
				tag.font,
				tag.size,
			);
			if (!families) {
				return;
			}
			const font = families[0];
			if (!font) {
				return;
			}
			const body = ecs.getComponent(id, RigidbodyComponent);
			const sprite = ecs.getComponent(id, SpriteComponent);
			const top =
				transform.position.y -
				(sprite?.height ?? body?.halfExtents.y ?? 0) -
				4;

			renderer.drawText(
				this.layer,
				font,
				tag.label,
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
