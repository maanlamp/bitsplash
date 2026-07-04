import { RENDER_LAYER_BASE } from "../../engine/render/render-layers";

export const SpriteLayer = {
	BACKGROUND: RENDER_LAYER_BASE - 10,
	CONTENT: RENDER_LAYER_BASE,
} as const;
