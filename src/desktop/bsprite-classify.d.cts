/** A `.bsprite` asset's manifest-driven classification. */
export type BspriteClassification = Readonly<{
	kind: "sprite" | "tileset" | "unknown";
	tileset?: boolean;
	columns?: number;
	width?: number;
	height?: number;
}>;

/**
 * Classify a `.bsprite` archive from its raw bytes. Reads only `manifest.json`
 * from the central directory; returns `{ kind: "unknown" }` on any failure
 * without throwing.
 */
export declare const classifyBspriteBytes: (
	bytes: Uint8Array,
) => BspriteClassification;
