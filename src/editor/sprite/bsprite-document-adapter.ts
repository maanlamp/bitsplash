import type { DocumentSnapshot } from "./bsprite-writer";
import type { SpriteEditCore } from "./sprite-edit-core";

export { DEFAULT_FRAME_DURATION_MS } from "./cel-store";

/**
 * Build a {@link DocumentSnapshot} for the `.bsprite` writer from a
 * {@link SpriteEditCore} — a real **multi-frame** snapshot: every layer
 * (metadata), every frame (duration), every present cel (sparse, layer × frame),
 * all tags, and any attachments/slice/tileset the core carries.
 *
 * Thin by construction: the core's cel store already holds cel pixels as
 * {@link import("./pixel-buffer").PixelBuffer}s, so this simply forwards
 * {@link SpriteEditCore.toSnapshot}. It only **reads** the core.
 */
export const snapshotFromDocument = (
	core: SpriteEditCore,
): DocumentSnapshot => core.toSnapshot();
