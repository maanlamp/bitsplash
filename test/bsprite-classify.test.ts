import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { classifyBspriteBytes } from "../src/desktop/bsprite-classify.cjs";
import type { BspriteManifest } from "../src/engine/sprite/bsprite-manifest";

const BASE: BspriteManifest = {
	version: 1,
	width: 96,
	height: 64,
	layers: [
		{
			id: "a1",
			name: "Layer 1",
			opacity: 1,
			visible: true,
			blend: "source-over",
		},
	],
	frames: [{ duration: 100 }],
	cels: [{ layer: "a1", frame: 0 }],
	tags: [{ name: "idle", from: 0, to: 0, loop: true }],
};

const archive = (manifest: BspriteManifest): Uint8Array =>
	zipSync({
		"manifest.json": strToU8(JSON.stringify(manifest)),
		"bakes/0.png": new Uint8Array([1, 2, 3, 4]),
		"layers/a1/0.png": new Uint8Array([5, 6, 7, 8]),
	});

describe("classifyBspriteBytes", () => {
	test("classifies a plain sprite and reads its dimensions", () => {
		const result = classifyBspriteBytes(archive(BASE));
		expect(result.kind).toBe("sprite");
		expect(result.tileset).toBe(false);
		expect(result.width).toBe(96);
		expect(result.height).toBe(64);
		expect(result.columns).toBeUndefined();
	});

	test("classifies a tileset by the manifest tileset block (presence is identity)", () => {
		const result = classifyBspriteBytes(
			archive({ ...BASE, tileset: { columns: 3 } }),
		);
		expect(result.kind).toBe("tileset");
		expect(result.tileset).toBe(true);
		expect(result.columns).toBe(3);
	});

	test("a corrupt zip resolves to unknown without throwing", () => {
		const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
		let result: ReturnType<typeof classifyBspriteBytes> | undefined;
		expect(() => {
			result = classifyBspriteBytes(garbage);
		}).not.toThrow();
		expect(result?.kind).toBe("unknown");
	});

	test("a zip with no manifest resolves to unknown", () => {
		const zip = zipSync({ "bakes/0.png": new Uint8Array([1, 2, 3]) });
		expect(classifyBspriteBytes(zip).kind).toBe("unknown");
	});
});
