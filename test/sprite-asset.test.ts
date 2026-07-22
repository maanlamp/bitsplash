import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import type { BspriteManifest } from "../src/engine/sprite/bsprite-manifest";
import {
	bspriteAttachment,
	bspriteContentRect,
	readBspriteManifest,
} from "../src/engine/sprite/sprite-asset";

const MANIFEST: BspriteManifest = {
	version: 1,
	width: 55,
	height: 55,
	layers: [
		{
			id: "a1b2c3d4",
			name: "Layer 1",
			opacity: 1,
			visible: true,
			blend: "source-over",
		},
	],
	frames: [{ duration: 100 }, { duration: 100 }],
	cels: [{ layer: "a1b2c3d4", frame: 0 }],
	tags: [{ name: "idle", from: 0, to: 1, loop: true }],
	contentRects: {
		idle: { x: 22, y: 15, width: 17, height: 33 },
	},
	attachments: {
		grip: {
			"0": { x: 30.5, y: 28 },
			"1": { x: 31, y: 27 },
		},
	},
};

const archive = (manifest: BspriteManifest): Uint8Array =>
	zipSync({
		"manifest.json": strToU8(JSON.stringify(manifest)),
	});

describe("readBspriteManifest", () => {
	test("parses the manifest.json entry from a zip archive", () => {
		const parsed = readBspriteManifest(archive(MANIFEST));
		expect(parsed.version).toBe(1);
		expect(parsed.width).toBe(55);
		expect(parsed.frames).toHaveLength(2);
		expect(parsed.attachments?.grip?.["0"]).toEqual({
			x: 30.5,
			y: 28,
		});
	});

	test("throws when the archive has no manifest.json", () => {
		const zip = zipSync({ "bakes/0.png": new Uint8Array([1, 2, 3]) });
		expect(() => readBspriteManifest(zip)).toThrow();
	});
});

describe("bspriteAttachment", () => {
	test("returns the point when the frame has an entry", () => {
		expect(bspriteAttachment(MANIFEST, "grip", 0)).toEqual({
			x: 30.5,
			y: 28,
		});
	});

	test("returns undefined when the frame lacks the point", () => {
		expect(bspriteAttachment(MANIFEST, "grip", 2)).toBeUndefined();
	});

	test("returns undefined for an unknown attachment name", () => {
		expect(bspriteAttachment(MANIFEST, "nock", 0)).toBeUndefined();
	});

	test("returns the authored point unmirrored (flip is a consumer concern)", () => {
		// The query no longer pre-mirrors for flipX; it hands back the stored
		// point verbatim. Mirroring happens downstream about the content-rect
		// center (see grip-offset.test.ts).
		expect(bspriteAttachment(MANIFEST, "grip", 0)).toEqual({
			x: 30.5,
			y: 28,
		});
	});
});

describe("bspriteContentRect", () => {
	test("returns the tag's derived rect", () => {
		expect(bspriteContentRect(MANIFEST, "idle")).toEqual({
			x: 22,
			y: 15,
			width: 17,
			height: 33,
		});
	});

	test("falls back to the full canvas when the tag has no rect", () => {
		expect(bspriteContentRect(MANIFEST, "run")).toEqual({
			x: 0,
			y: 0,
			width: 55,
			height: 55,
		});
	});

	test("falls back to the full canvas when no tag is given", () => {
		expect(bspriteContentRect(MANIFEST)).toEqual({
			x: 0,
			y: 0,
			width: 55,
			height: 55,
		});
	});
});
