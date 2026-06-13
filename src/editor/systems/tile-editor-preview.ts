import {
	type RenderContext,
	RenderSystem,
} from "../../engine/system";
import { pickActiveCamera2D } from "../../engine/systems/camera-2d";
import { TILE_SIZE } from "../../engine/tile";
import { TileGrid } from "../../engine/tilemap/grid";
import type { EditorState } from "../editor-state";

type CellStyle = Readonly<{
	fill: string;
	stroke: string;
}>;

export class TileEditorPreviewSystem implements RenderSystem {
	private grid: TileGrid;
	private layer: number;
	private editor: EditorState;

	private readonly addStyle: CellStyle = {
		fill: "rgba(255, 255, 255, 0.25)",
		stroke: "rgba(255, 255, 255, 0.6)",
	};
	private readonly deleteStyle: CellStyle = {
		fill: "rgba(255, 80, 80, 0.25)",
		stroke: "rgba(255, 80, 80, 0.7)",
	};

	constructor(grid: TileGrid, layer: number, editor: EditorState) {
		this.grid = grid;
		this.layer = layer;
		this.editor = editor;
	}

	render({ renderer, ecs, input }: RenderContext): void {
		const camera = pickActiveCamera2D(ecs);
		if (
			this.editor.mode === "pan" ||
			this.editor.mode === "select" ||
			!input.mouse.inside ||
			!camera
		) {
			return;
		}
		const world = camera.screenToWorld(input.mouse.position);
		const gx = Math.floor(world.x / TILE_SIZE);
		const gy = Math.floor(world.y / TILE_SIZE);
		let style: CellStyle;
		if (this.editor.mode === "eraser") {
			style = this.deleteStyle;
		} else if (this.editor.mode === "paint") {
			style = this.addStyle;
		} else {
			style = this.grid.hasTile(gx, gy)
				? this.deleteStyle
				: this.addStyle;
		}
		renderer.drawRect(this.layer, {
			x: gx * TILE_SIZE,
			y: gy * TILE_SIZE,
			width: TILE_SIZE,
			height: TILE_SIZE,
			fill: style.fill,
			stroke: style.stroke,
			lineWidth: 1,
		});
	}
}
