import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { serializeBsprite } from "../src/editor/sprite/bsprite-writer";
import {
	CelStore,
	type CelStoreDescription,
} from "../src/editor/sprite/cel-store";
import { describeArchive } from "../src/editor/sprite/bsprite-loader";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";

/**
 * The attachment save/load round-trip through the **real artifact**: edit points
 * on a {@link CelStore}, serialize the document snapshot to `.bsprite` bytes, and
 * assert the committed manifest reflects them — then decode the archive back into
 * a store description and confirm the points are editable again. This guards the
 * whole path `edit → toSnapshot → serializeBsprite → readBspriteManifest` and its
 * inverse `describeArchive → fromDescription`.
 */

const authored = (): CelStore => {
	const store = new CelStore(16, 16);
	store.createAttachment("grip");
	store.setAttachmentPoint("grip", 0, { x: 8.5, y: 6 });
	store.setAttachmentPoint("grip", 2, { x: 9, y: 5.5 });
	store.createAttachment("nock");
	store.setAttachmentPoint("nock", 0, { x: 12, y: 3 });
	// Grow to 3 frames so frame index 2 is valid on load.
	store.insertFrame(1, 100);
	store.insertFrame(2, 100);
	return store;
};

describe("attachments round-trip through the serialized .bsprite", () => {
	const store = authored();
	const bytes = serializeBsprite(store.toSnapshot());
	const manifest = readBspriteManifest(bytes);

	test("the committed manifest carries the authored points", () => {
		expect(manifest.attachments).toEqual({
			grip: {
				"0": { x: 8.5, y: 6 },
				"2": { x: 9, y: 5.5 },
			},
			nock: {
				"0": { x: 12, y: 3 },
			},
		});
	});

	test("decoding the archive yields an editable store with the points", () => {
		const desc: CelStoreDescription = describeArchive(
			unzipSync(bytes),
		);
		const loaded = CelStore.fromDescription(desc);
		expect(loaded.attachmentNames()).toEqual(["grip", "nock"]);
		expect(loaded.attachmentPoint("grip", 0)).toEqual({
			x: 8.5,
			y: 6,
		});
		expect(loaded.attachmentPoint("grip", 2)).toEqual({
			x: 9,
			y: 5.5,
		});
		expect(loaded.attachmentPoint("nock", 0)).toEqual({
			x: 12,
			y: 3,
		});
		// Absent frame has no point (sparse, no fallback).
		expect(loaded.attachmentPoint("grip", 1)).toBeUndefined();
	});

	test("a name with no points survives the round-trip", () => {
		const empty = new CelStore(8, 8);
		empty.createAttachment("marker");
		const reloaded = CelStore.fromDescription(
			describeArchive(
				unzipSync(serializeBsprite(empty.toSnapshot())),
			),
		);
		expect(reloaded.attachmentNames()).toEqual(["marker"]);
		expect(reloaded.attachmentPoint("marker", 0)).toBeUndefined();
	});

	test("a document with no attachments omits the manifest key", () => {
		const bare = readBspriteManifest(
			serializeBsprite(new CelStore(8, 8).toSnapshot()),
		);
		expect(bare.attachments).toBeUndefined();
	});
});
