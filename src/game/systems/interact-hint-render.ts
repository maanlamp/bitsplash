import { SpriteComponent } from "../../engine/components/sprite";
import { TransformComponent } from "../../engine/components/transform";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import yosterFontUrl from "../assets/yoster.ttf?url";
import { DialogueComponent } from "../components/dialogue";
import { InteractableComponent } from "../components/interactable";
import { InteractionStateComponent } from "../components/interaction-state";
import { InputBindings } from "../input-bindings";

export class InteractHintRenderSystem implements RenderSystem {
	private layer: number;
	private outlineLayer: number;

	constructor(layer: number, outlineLayer: number) {
		this.layer = layer;
		this.outlineLayer = outlineLayer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		if (ecs.query(DialogueComponent)[0]) {
			return;
		}
		const stateEntry = ecs.query(InteractionStateComponent)[0];
		if (!stateEntry) {
			return;
		}
		const inRange = stateEntry[1].inRange;
		if (!inRange) {
			return;
		}
		const interactable = ecs.getComponent(
			inRange,
			InteractableComponent,
		);
		const transform = ecs.getComponent(inRange, TransformComponent);
		if (!interactable || !transform) {
			return;
		}
		const sprite = ecs.getComponent(inRange, SpriteComponent);
		if (sprite) {
			const image = assetManager.getImage(sprite.url);
			if (image) {
				renderer.drawImageOutline(this.outlineLayer, image, {
					x: transform.position.x,
					y: transform.position.y,
					width: sprite.width,
					height: sprite.height,
					rotation: transform.rotation.radians,
				});
			}
		}
		const font = assetManager.getFont(yosterFontUrl);
		if (!font) {
			return;
		}
		const top =
			transform.position.y - (sprite ? sprite.height / 2 : 0) - 4;

		renderer.drawText(
			this.layer,
			font,
			`Press ${InputBindings.interact} to ${interactable.prompt}`,
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
