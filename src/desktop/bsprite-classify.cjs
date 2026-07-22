const { unzipSync, strFromU8 } = require("fflate");

/**
 * Classify a `.bsprite` archive from its raw bytes by parsing the central
 * directory and reading `manifest.json`. Pure and dependency-light so both the
 * main process (`main.cjs`) and the headless test import it.
 *
 * Only `manifest.json` is inflated (an `fflate` name filter skips the baked
 * frame and cel PNGs), so classification stays cheap on large archives. A
 * `.bsprite` is a tileset iff the manifest carries a `tileset` block — presence
 * is identity, per `docs/bsprite-format.md`. Any failure (corrupt zip, missing
 * or invalid manifest) resolves to `{ kind: "unknown" }` and never throws, so a
 * bad file can never crash the asset listing.
 *
 * @param {Uint8Array} bytes the archive contents.
 * @returns {{ kind: "sprite" | "tileset" | "unknown", tileset?: boolean, columns?: number, width?: number, height?: number }}
 */
const classifyBspriteBytes = (bytes) => {
	try {
		const entries = unzipSync(bytes, {
			filter: (file) => file.name === "manifest.json",
		});
		const raw = entries["manifest.json"];
		if (!raw) {
			return { kind: "unknown" };
		}
		const manifest = JSON.parse(strFromU8(raw));
		const tileset = manifest.tileset != null;
		const columns =
			tileset && typeof manifest.tileset.columns === "number"
				? manifest.tileset.columns
				: undefined;
		return {
			kind: tileset ? "tileset" : "sprite",
			tileset,
			columns,
			width:
				typeof manifest.width === "number"
					? manifest.width
					: undefined,
			height:
				typeof manifest.height === "number"
					? manifest.height
					: undefined,
		};
	} catch {
		return { kind: "unknown" };
	}
};

module.exports = { classifyBspriteBytes };
