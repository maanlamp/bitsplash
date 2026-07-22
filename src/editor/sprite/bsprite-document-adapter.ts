import type { DocumentSnapshot } from "./bsprite-writer";
import type { SpriteDocument } from "./sprite-document";

export { DEFAULT_FRAME_DURATION_MS } from "./cel-store";

/**
 * Build a {@link DocumentSnapshot} for the `.bsprite` writer from a
 * {@link SpriteDocument} — a real **multi-frame** snapshot: every layer
 * (metadata), every frame (duration), every present cel (sparse, layer × frame),
 * all tags, and any attachments/slice/tileset the document carries.
 *
 * Thin by construction: the document's {@link CelStore} already holds cel pixels
 * as {@link import("./pixel-buffer").PixelBuffer}s, so this simply forwards
 * {@link SpriteDocument.toSnapshot}. It only **reads** the document.
 */
export const snapshotFromDocument = (
	doc: SpriteDocument,
): DocumentSnapshot => doc.toSnapshot();
