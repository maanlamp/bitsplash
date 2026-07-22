import { unzipSync } from "fflate";
import { manifestFromEntries } from "../../engine/sprite/sprite-asset";
import type { CelInput } from "./bsprite-writer";
import type { CelStoreDescription } from "./cel-store";
import { decodePng } from "./png-codec";

/**
 * The parsed entry map of a `.bsprite` archive — exactly what `fflate`'s
 * `unzipSync` returns. Retained on the document as its **base archive** so a
 * later save can copy byte-verbatim the cel/bake PNGs that did not change (see
 * {@link import("./bsprite-writer").WriteOptions.previous}).
 */
export type BspriteArchive = Readonly<Record<string, Uint8Array>>;

const celPath = (layerId: string, frame: number): string =>
	`layers/${layerId}/${frame}.png`;

/**
 * Unzip raw `.bsprite` bytes into the entry map. The archive is kept so the next
 * save can reuse unchanged PNG entries verbatim. Pure and DOM-free.
 */
export const unpackBsprite = (
	bytes: Uint8Array,
): Record<string, Uint8Array> => unzipSync(bytes);

/**
 * Decode an unzipped `.bsprite` archive into a {@link CelStoreDescription}: parse
 * the manifest, decode every present cel PNG (`layers/<layerId>/<frame>.png`)
 * into a {@link import("./pixel-buffer").PixelBuffer}, and forward the metadata
 * (tags, attachments, slice, tileset). The engine's baked frames are ignored —
 * the editor rebakes from cels — so this is the inverse of the writer's cel path.
 *
 * Pure and DOM-free (uses the headless {@link decodePng}), so the whole load path
 * is unit-testable without a canvas.
 *
 * @throws if the archive has no `manifest.json` or a cel PNG is malformed.
 */
export const describeArchive = (
	entries: BspriteArchive,
): CelStoreDescription => {
	const manifest = manifestFromEntries(entries);
	const cels: CelInput[] = [];
	for (const cel of manifest.cels) {
		const png = entries[celPath(cel.layer, cel.frame)];
		if (!png) {
			continue;
		}
		cels.push({
			layerId: cel.layer,
			frameIndex: cel.frame,
			pixels: decodePng(png),
		});
	}
	return {
		width: manifest.width,
		height: manifest.height,
		layers: manifest.layers,
		frames: manifest.frames,
		cels,
		tags: manifest.tags,
		...(manifest.attachments
			? { attachments: manifest.attachments }
			: {}),
		...(manifest.slice ? { slice: manifest.slice } : {}),
		...(manifest.tileset ? { tileset: manifest.tileset } : {}),
	};
};
