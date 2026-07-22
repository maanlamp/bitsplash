import { describe, expect, test } from "bun:test";
import type Renderer2D from "../src/engine/render/renderer-2d";
import type { TileSource } from "../src/engine/render/renderer-2d";
import {
	invalidateImageEverywhere,
	invalidateTileArrayEverywhere,
	registerRenderer,
	unregisterRenderer,
} from "../src/engine/render/renderer-registry";

/**
 * A stand-in exposing only the two invalidation methods the fan-out calls, so
 * the registry's register/iterate/unregister behaviour is exercised without a
 * WebGL context.
 */
class FakeRenderer {
	tileArrays: TileSource[] = [];
	images: TileSource[] = [];
	invalidateTileArray(source: TileSource): void {
		this.tileArrays.push(source);
	}
	invalidateImage(source: TileSource): void {
		this.images.push(source);
	}
}

const asRenderer = (fake: FakeRenderer): Renderer2D =>
	fake as unknown as Renderer2D;

const source = (): TileSource =>
	({ width: 1, height: 1 }) as unknown as TileSource;

describe("renderer registry fan-out", () => {
	test("invalidateTileArrayEverywhere reaches every registered renderer", () => {
		const a = new FakeRenderer();
		const b = new FakeRenderer();
		registerRenderer(asRenderer(a));
		registerRenderer(asRenderer(b));
		const img = source();
		try {
			invalidateTileArrayEverywhere(img);
			expect(a.tileArrays).toEqual([img]);
			expect(b.tileArrays).toEqual([img]);
		} finally {
			unregisterRenderer(asRenderer(a));
			unregisterRenderer(asRenderer(b));
		}
	});

	test("invalidateImageEverywhere reaches every registered renderer", () => {
		const a = new FakeRenderer();
		registerRenderer(asRenderer(a));
		const img = source();
		try {
			invalidateImageEverywhere(img);
			expect(a.images).toEqual([img]);
		} finally {
			unregisterRenderer(asRenderer(a));
		}
	});

	test("an unregistered renderer is no longer reached", () => {
		const a = new FakeRenderer();
		registerRenderer(asRenderer(a));
		unregisterRenderer(asRenderer(a));
		invalidateTileArrayEverywhere(source());
		invalidateImageEverywhere(source());
		expect(a.tileArrays).toHaveLength(0);
		expect(a.images).toHaveLength(0);
	});
});
