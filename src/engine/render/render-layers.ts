import type { ReadonlyECS } from "../ecs";
import {
	RenderLayerDef,
	RenderLayersComponent,
} from "./render-layers-component";

export const RENDER_LAYER_BASE = 1000;
export const RENDER_ORDER_STRIDE = 1000;

export const DEFAULT_RENDER_LAYERS: ReadonlyArray<string> = [
	"background",
	"entities",
	"foreground",
	"terrain",
	"overlay",
];

export const renderLayerDef = (
	id: string,
	name = id,
): RenderLayerDef => {
	const def = new RenderLayerDef();
	def.id = id;
	def.name = name;
	return def;
};

export const resolveRenderLayer = (
	ecs: ReadonlyECS,
	layer: string,
	order = 0,
): number => {
	const layers =
		ecs.query(RenderLayersComponent)[0]?.[1].layers ?? [];
	let index = layers.findIndex((def) => def.id === layer);
	if (index < 0) {
		index = layers.length;
	}
	const clamped = Math.min(
		Math.max(order, 0),
		RENDER_ORDER_STRIDE - 1,
	);
	return RENDER_LAYER_BASE + index * RENDER_ORDER_STRIDE + clamped;
};
