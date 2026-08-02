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

type LayerIndex = {
	readonly indices: Map<string, number>;
	fallback: number;
	stale: boolean;
};

const layerIndices = new WeakMap<object, LayerIndex>();

/**
 * The `layer id → position` table for a world, rebuilt only when the world
 * changes shape.
 *
 * `resolveRenderLayer` runs per sprite, per UI node, per tilemap layer and per
 * decoration set, so a world query and a `findIndex` scan per call is a
 * per-frame cost proportional to everything drawn. The table is memoized per
 * ECS and marked stale by the world's own change notification, which is what
 * fires when a scene loads, swaps, or replaces the `RenderLayersComponent`.
 */
const resolveLayerIndex = (ecs: ReadonlyECS): LayerIndex => {
	let memo = layerIndices.get(ecs);
	if (!memo) {
		memo = { indices: new Map(), fallback: 0, stale: true };
		layerIndices.set(ecs, memo);
		const entry = memo;
		ecs.subscribe(() => {
			entry.stale = true;
		});
	}
	if (memo.stale) {
		const layers = ecs.queryFirst(RenderLayersComponent)?.[1].layers;
		memo.indices.clear();
		memo.fallback = layers ? layers.length : 0;
		if (layers) {
			for (let i = 0; i < layers.length; i++) {
				memo.indices.set(layers[i]!.id, i);
			}
		}
		memo.stale = false;
	}
	return memo;
};

/**
 * The absolute render order for a named layer, offset by `order` within it.
 *
 * Unknown layer names sort after every declared layer.
 *
 * @example
 * renderer.draw(sprite, resolveRenderLayer(ecs, "entities", 3));
 */
export const resolveRenderLayer = (
	ecs: ReadonlyECS,
	layer: string,
	order = 0,
): number => {
	const memo = resolveLayerIndex(ecs);
	const index = memo.indices.get(layer) ?? memo.fallback;
	const clamped = Math.min(
		Math.max(order, 0),
		RENDER_ORDER_STRIDE - 1,
	);
	return RENDER_LAYER_BASE + index * RENDER_ORDER_STRIDE + clamped;
};
