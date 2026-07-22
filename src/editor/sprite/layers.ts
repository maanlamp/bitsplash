import { RENDER_LAYER_BASE } from "../../engine/render/render-layers";

export const SpriteLayer = {
	BACKGROUND: RENDER_LAYER_BASE - 10,
	ONION: RENDER_LAYER_BASE - 5,
	CONTENT: RENDER_LAYER_BASE,
	SELECTION: RENDER_LAYER_BASE + 5,
} as const;
