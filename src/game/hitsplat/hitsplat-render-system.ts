import { TransformComponent } from "../../engine/transform-component";
import type { EntityId } from "../../engine/ecs";
import type { LoadedFont } from "../../engine/load";
import { resolveFont } from "../../engine/text/resolve-font";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import {
	fadeAlpha,
	withAlpha,
} from "../../engine/render/color-resolver";
import { resolveRenderLayer } from "../../engine/render/render-layers";
import { HitsplatComponent } from "./hitsplat-component";
import { HitsplatStyleComponent } from "./hitsplat-style-component";

export class HitsplatRenderSystem implements RenderSystem {
	private layer: string;

	constructor(layer: string) {
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		const styleEntry = ecs.query(HitsplatStyleComponent)[0];
		if (!styleEntry) {
			return;
		}
		const style = styleEntry[1];
		const normalFont = resolveFont(style.font, assetManager);
		const critFont = resolveFont(style.critFont, assetManager);
		if (!normalFont || !critFont) {
			return;
		}
		const layer = resolveRenderLayer(ecs, this.layer);

		for (const [id, hitsplat, transform] of ecs.query(
			HitsplatComponent,
			TransformComponent,
		)) {
			const alpha = fadeAlpha(
				hitsplat.lifetime - hitsplat.age,
				hitsplat.lifetime * style.fadePortion.value,
			);
			const scale = this.popScale(hitsplat, style);
			const font = hitsplat.crit ? critFont : normalFont;
			const fill = (
				hitsplat.incoming
					? style.incomingColor
					: hitsplat.crit
						? style.critColor
						: style.color
			).rgba;

			this.draw(
				renderer,
				layer,
				font,
				hitsplat.text,
				transform.position.x,
				transform.position.y,
				scale,
				0,
				withAlpha(fill, alpha),
				withAlpha(style.outlineColor.rgba, alpha),
			);

			if (hitsplat.crit && hitsplat.flavour) {
				const tilt = this.tilt(id) * style.flavourTilt.radians;
				const offset = (style.critFont.size + 2) * scale;
				this.draw(
					renderer,
					layer,
					critFont,
					hitsplat.flavour,
					transform.position.x,
					transform.position.y - offset,
					scale,
					tilt,
					withAlpha(fill, alpha),
					withAlpha(style.outlineColor.rgba, alpha),
				);
			}
		}
	}

	private draw(
		renderer: RenderContext["renderer"],
		layer: number,
		font: LoadedFont,
		text: string,
		x: number,
		y: number,
		scale: number,
		rotation: number,
		color: ReturnType<typeof withAlpha>,
		outline: ReturnType<typeof withAlpha>,
	): void {
		renderer.drawText(layer, font, text, x, y, {
			align: "center",
			color,
			outline,
			scale,
			rotation,
		});
	}

	private popScale(
		hitsplat: HitsplatComponent,
		style: HitsplatStyleComponent,
	): number {
		if (!hitsplat.crit || hitsplat.age >= style.popDuration.seconds) {
			return 1;
		}
		const t = hitsplat.age / style.popDuration.seconds;
		return style.popScale + (1 - style.popScale) * t;
	}

	private tilt(id: EntityId): number {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		return (Math.abs(hash % 2001) - 1000) / 1000;
	}
}
