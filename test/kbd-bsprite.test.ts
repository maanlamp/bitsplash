import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	SpriteAsset,
	readBspriteManifest,
} from "../src/engine/sprite/sprite-asset";
import { headlessSheetComposer } from "./support/sequence-harness";

const KBD_BYTES = new Uint8Array(
	readFileSync(
		`${import.meta.dir}/../src/game/content/assets/kbd.bsprite`,
	),
);

/**
 * Guards the migrated keycap artifact: `kbd.bsprite` must carry the 9-slice
 * insets in its manifest (previously the hardcoded `KBD_INSETS` in
 * `kbd-frame.ts`), so `SpriteAsset.slice()` resolves them from the manifest with
 * no PNG `iTXt` reader and no code-side fallback.
 */
describe("kbd.bsprite migrated artifact", () => {
	test("manifest carries the keycap 9-slice insets", () => {
		const manifest = readBspriteManifest(KBD_BYTES);
		expect(manifest.width).toBe(16);
		expect(manifest.height).toBe(16);
		expect(manifest.slice).toEqual({
			left: 5,
			right: 5,
			top: 4,
			bottom: 7,
			gap: 0,
		});
		expect(manifest.layers.map((l) => l.name)).toEqual([
			"Background",
		]);
	});

	test("SpriteAsset.slice() resolves the insets from the manifest (no iTXt reader)", async () => {
		const asset = await SpriteAsset.loadBsprite(
			"kbd.bsprite",
			KBD_BYTES,
			headlessSheetComposer,
		);
		expect(asset.slice()).toEqual({
			left: 5,
			right: 5,
			top: 4,
			bottom: 7,
			gap: 0,
		});
	});
});
