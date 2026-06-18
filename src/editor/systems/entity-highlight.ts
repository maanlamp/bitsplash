import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import type Renderer2D from "../../engine/renderer-2d";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/systems/camera-2d";
import type { EditorState } from "../editor-state";
import { entityBounds } from "../pick";

const HOVER_STROKE = "rgba(255, 255, 255, 0.5)";
const SELECTED_STROKE = "rgba(80, 180, 255, 0.95)";

export class EntityHighlightSystem implements RenderSystem {
	private store: EditorState;
	private layer: number;

	constructor(store: EditorState, layer: number) {
		this.store = store;
		this.layer = layer;
	}

	render({ renderer, ecs, assetManager }: RenderContext): void {
		const zoom = pickActiveCamera2D(ecs)?.zoom ?? 1;
		const lineWidth = 2 / zoom;
		const hovered = this.store.hovered;
		const selected = this.store.selected;

		if (hovered && hovered !== selected) {
			this.outline(
				renderer,
				ecs,
				assetManager,
				hovered,
				HOVER_STROKE,
				lineWidth,
			);
		}
		if (selected) {
			this.outline(
				renderer,
				ecs,
				assetManager,
				selected,
				SELECTED_STROKE,
				lineWidth,
			);
		}
	}

	private outline(
		renderer: Renderer2D,
		ecs: ReadonlyECS,
		assetManager: RenderContext["assetManager"],
		id: EntityId,
		stroke: string,
		lineWidth: number,
	): void {
		const bounds = entityBounds(ecs, id, assetManager);
		if (!bounds) {
			return;
		}
		renderer.drawRect(this.layer, {
			x: bounds.center.x - bounds.half.x,
			y: bounds.center.y - bounds.half.y,
			width: bounds.half.x * 2,
			height: bounds.half.y * 2,
			stroke,
			lineWidth,
		});
	}
}
