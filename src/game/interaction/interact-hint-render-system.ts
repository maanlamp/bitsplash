import {
	SpriteComponent,
	spriteImageUrl,
	spriteSource,
} from "../../engine/sprite/sprite-component";
import { TransformComponent } from "../../engine/transform-component";
import { resolveFont } from "../../engine/text/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { isCutsceneActive } from "../../engine/cutscene/cutscene-system";
import { DialogueComponent } from "../../engine/dialogue/dialogue-component";
import { InteractableComponent } from "../interaction/interactable-component";
import { InteractionStateComponent } from "../interaction/interaction-state-component";
import { InputBindings } from "../input-bindings";

export class InteractHintRenderSystem implements RenderSystem {
	private layer: number;
	private outlineLayer: number;

	constructor(layer: number, outlineLayer: number) {
		this.layer = layer;
		this.outlineLayer = outlineLayer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		if (ecs.query(DialogueComponent)[0] || isCutsceneActive(ecs)) {
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
		let spriteHalfHeight = 0;
		if (sprite) {
			const image = assetManager.getImage(spriteImageUrl(sprite));
			if (image) {
				const source = spriteSource(sprite, image);
				const height = source.height * transform.scale.y;
				renderer.drawImageOutline(this.outlineLayer, image, {
					x: transform.position.x,
					y: transform.position.y,
					width: source.width * transform.scale.x,
					height,
					rotation: transform.rotation.radians,
				});
				spriteHalfHeight = height / 2;
			}
		}
		const font = resolveFont(interactable.font, assetManager);
		if (!font) {
			return;
		}
		const top = transform.position.y - spriteHalfHeight - 4;

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
