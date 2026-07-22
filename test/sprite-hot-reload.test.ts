import { describe, expect, test } from "bun:test";
import AssetManager, {
	type BspriteBytesLoader,
} from "../src/engine/assets";
import { bspriteSource } from "../src/engine/sprite/sprite-component";
import { readBspriteManifest } from "../src/engine/sprite/sprite-asset";
import type { BspriteLayer } from "../src/engine/sprite/bsprite-manifest";
import { CelStore } from "../src/editor/sprite/cel-store";
import type { CelStoreDescription } from "../src/editor/sprite/cel-store";
import { unpackBsprite } from "../src/editor/sprite/bsprite-loader";
import { decodePng } from "../src/editor/sprite/png-codec";
import { type PixelBuffer } from "../src/editor/sprite/pixel-buffer";
import { serializeBsprite } from "../src/editor/sprite/bsprite-writer";
import {
	headlessSheetComposer,
	SpriteHotReloadFixture,
} from "./support/sequence-harness";

/**
 * Step 18 — `.bsprite` hot-reload validation (headless integration test).
 *
 * What is asserted HEADLESSLY here (real code, no fakes of the mechanism):
 *  - the save→evict→re-serve self-heal: after new bytes + `evict`, the facade
 *    re-loads and serves the NEW manifest dimensions / frame count / content rect;
 *  - the render-facing source rect (`bspriteSource`, used verbatim by
 *    `SpriteRenderSystem`) tracks the new dimensions;
 *  - the tag-playback consumer (`SpriteTagPlaybackSystem`) sees the new frame
 *    count;
 *  - a stale in-flight v1 load cannot resurrect the evicted entry over v2
 *    (facade generation token);
 *  - the artifact round-trip: the REAL editor writer's v2 bytes decode, through
 *    the manifest reader and `decodePng`, to the expected dims / frames / pixels.
 *
 * What remains DOM/WebGL-only and is therefore NOT asserted (read-verified only):
 *  - the actual GPU texture upload of the composed sheet and the on-screen pixels
 *    of the WebGL scene view. Bun has no canvas/`createImageBitmap`/WebGL, so the
 *    sheet composer is the injected `headlessSheetComposer` (see its docs). The
 *    baked pixels it would upload are verified by decoding the archive directly.
 *
 * "Saving through the editor document path": the DOM `SpriteDocument` wrapper
 * cannot run headlessly, so bytes are produced via the pure `CelStore` +
 * `serializeBsprite` path — which IS the writer the document path calls.
 */

const URL = "hero.bsprite";
const LAYER: BspriteLayer = {
	id: "L1",
	name: "Layer 1",
	opacity: 1,
	visible: true,
	blend: "source-over",
};

type Rgba = readonly [number, number, number, number];

const solid = (size: number, [r, g, b, a]: Rgba): PixelBuffer => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = a;
	}
	return { width: size, height: size, data };
};

/**
 * Produce `.bsprite` bytes with the real writer: build a cel document with
 * `CelStore.fromDescription`, then `serializeBsprite(store.toSnapshot())`. Solid
 * fills make each tag's derived content rect the full canvas, so dimensions are
 * deterministic.
 */
const makeBytes = (
	size: number,
	frames: number,
	color: Rgba,
): Uint8Array => {
	const desc: CelStoreDescription = {
		width: size,
		height: size,
		layers: [LAYER],
		frames: Array.from({ length: frames }, () => ({ duration: 100 })),
		cels: Array.from({ length: frames }, (_v, frameIndex) => ({
			layerId: LAYER.id,
			frameIndex,
			pixels: solid(size, color),
		})),
		tags: [{ name: "idle", from: 0, to: frames - 1, loop: true }],
	};
	return serializeBsprite(
		CelStore.fromDescription(desc).toSnapshot(),
	);
};

const V1 = makeBytes(16, 2, [255, 0, 0, 255]);
const V2 = makeBytes(24, 3, [0, 0, 255, 255]);

const tick = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

const flush = async (times = 4): Promise<void> => {
	for (let i = 0; i < times; i++) {
		await tick();
	}
};

describe("bsprite hot reload — artifact round-trip through the real writer", () => {
	test("v1 bytes carry 16×16 / 2 frames / red pixels", () => {
		const manifest = readBspriteManifest(V1);
		expect(manifest.width).toBe(16);
		expect(manifest.height).toBe(16);
		expect(manifest.frames).toHaveLength(2);
		expect(manifest.tags).toEqual([
			{ name: "idle", from: 0, to: 1, loop: true },
		]);
		const frame0 = decodePng(unpackBsprite(V1)["bakes/0.png"]!);
		expect(frame0.width).toBe(16);
		expect(Array.from(frame0.data.slice(0, 4))).toEqual([
			255, 0, 0, 255,
		]);
	});

	test("v2 bytes carry 24×24 / 3 frames / blue pixels", () => {
		const manifest = readBspriteManifest(V2);
		expect(manifest.width).toBe(24);
		expect(manifest.height).toBe(24);
		expect(manifest.frames).toHaveLength(3);
		expect(manifest.tags).toEqual([
			{ name: "idle", from: 0, to: 2, loop: true },
		]);
		const frame0 = decodePng(unpackBsprite(V2)["bakes/0.png"]!);
		expect(frame0.width).toBe(24);
		expect(Array.from(frame0.data.slice(0, 4))).toEqual([
			0, 0, 255, 255,
		]);
	});
});

describe("bsprite hot reload — save → evict → re-serve self-heal", () => {
	test("facade + render source rect pick up new dimensions and frame count", async () => {
		const state = { bytes: V1 };
		const fx = new SpriteHotReloadFixture({
			url: URL,
			loadBytes: (async () =>
				state.bytes) satisfies BspriteBytesLoader,
			tag: "idle",
		});

		const a1 = await fx.load();
		expect(a1.width).toBe(16);
		expect(a1.height).toBe(16);
		expect(a1.frameCount).toBe(2);
		// The srcW/srcH SpriteRenderSystem draws with (via bspriteSource).
		expect(bspriteSource(fx.sprite, a1).width).toBe(16);
		expect(bspriteSource(fx.sprite, a1).height).toBe(16);

		// "Save" v2, then evict — the editor save path's hot-reload trigger.
		state.bytes = V2;
		fx.evict();

		const a2 = await fx.load();
		expect(a2.width).toBe(24);
		expect(a2.height).toBe(24);
		expect(a2.frameCount).toBe(3);
		expect(bspriteSource(fx.sprite, a2).width).toBe(24);
		expect(bspriteSource(fx.sprite, a2).height).toBe(24);
	});

	test("the tag-playback consumer sees the new frame count after reload", async () => {
		const state = { bytes: V1 };
		const fx = new SpriteHotReloadFixture({
			url: URL,
			loadBytes: (async () =>
				state.bytes) satisfies BspriteBytesLoader,
			tag: "idle",
		});

		const framesSeen = (): ReadonlySet<number> => {
			const seen = new Set<number>();
			fx.step(0); // latch the tag (transition to its first frame)
			seen.add(fx.sprite.frame);
			for (let i = 0; i < 8; i++) {
				fx.step(100);
				seen.add(fx.sprite.frame);
			}
			return seen;
		};

		await fx.load();
		const v1Frames = framesSeen();
		// idle spans frames 0..1 in v1 — frame 2 can never appear.
		expect(v1Frames.has(1)).toBe(true);
		expect(v1Frames.has(2)).toBe(false);

		state.bytes = V2;
		fx.evict();
		await fx.load();
		const v2Frames = framesSeen();
		// idle now spans 0..2 — the consumer advances into the new frame 2.
		expect(v2Frames.has(2)).toBe(true);
	});

	test("BITE: without evict, the facade keeps serving stale v1", async () => {
		const state = { bytes: V1 };
		const fx = new SpriteHotReloadFixture({
			url: URL,
			loadBytes: (async () =>
				state.bytes) satisfies BspriteBytesLoader,
			tag: "idle",
		});

		const a1 = await fx.load();
		expect(a1.width).toBe(16);

		// "Save" v2 but DO NOT evict. The self-heal assertions above would fail
		// here — this locks in that eviction (plan step A5) is what heals.
		state.bytes = V2;
		await flush();
		const stale = fx.peek();
		expect(stale?.width).toBe(16);
		expect(stale?.frameCount).toBe(2);
	});
});

describe("bsprite hot reload — stale in-flight load cannot resurrect v1", () => {
	test("an evicted, still-in-flight v1 load is dropped in favor of v2", async () => {
		const resolvers: Array<(bytes: Uint8Array) => void> = [];
		const loadBytes: BspriteBytesLoader = () =>
			new Promise<Uint8Array>((resolve) => {
				resolvers.push(resolve);
			});
		const am = new AssetManager(
			undefined,
			loadBytes,
			headlessSheetComposer,
		);

		// First poll starts load #1 (v1).
		expect(am.sprites.get(URL)).toBeUndefined();
		// Evict mid-flight, then poll again: load #2 (v2) starts under a new token.
		am.evict(URL);
		expect(am.sprites.get(URL)).toBeUndefined();
		expect(resolvers).toHaveLength(2);

		// The stale load #1 resolves late — its result must be discarded.
		resolvers[0]!(V1);
		await flush();
		expect(am.sprites.get(URL)).toBeUndefined();

		// The fresh load #2 resolves and populates the cache with v2.
		resolvers[1]!(V2);
		await flush();
		const asset = am.sprites.get(URL);
		expect(asset?.width).toBe(24);
		expect(asset?.frameCount).toBe(3);
	});
});
