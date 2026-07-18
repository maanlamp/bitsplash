import type { EntityId, ReadonlyECS } from "../../engine/ecs";
import type Renderer2D from "../../engine/render/renderer-2d";
import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import type { EditorState } from "../editor-state";
import { entityAabb } from "../pick";

const HOVER_STROKE = "rgba(255, 255, 255, 0.5)";
const SELECTION_STROKE = "rgba(80, 180, 255, 0.95)";

export class EntityHighlightSystem implements RenderSystem {
	constructor(
		private readonly store: EditorState,
		private readonly layer: number,
	) {}

	render({
		renderer,
		ecs,
		assetManager,
		camera,
	}: RenderContext): void {
		const zoom = camera?.zoom ?? 1;
		const lineWidth = 2 / zoom;
		const hovered = this.store.hovered;
		const selection = this.store.selection;

		if (hovered && !selection.ids.has(hovered)) {
			this.outline(
				renderer,
				ecs,
				assetManager,
				hovered,
				HOVER_STROKE,
				lineWidth,
			);
		}
		for (const id of selection.ids) {
			this.outline(
				renderer,
				ecs,
				assetManager,
				id,
				SELECTION_STROKE,
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
		const aabb = entityAabb(ecs, id, assetManager);
		if (!aabb) {
			return;
		}
		renderer.drawRect(this.layer, {
			x: aabb.minX,
			y: aabb.minY,
			width: aabb.maxX - aabb.minX,
			height: aabb.maxY - aabb.minY,
			stroke,
			lineWidth,
		});
	}
}
