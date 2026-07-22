import { describe, expect, test } from "bun:test";
import type AssetManager from "../src/engine/assets";
import type { SpriteAsset } from "../src/engine/sprite/sprite-asset";
import type { TileSource } from "../src/engine/render/renderer-2d";
import { resolveSpriteDraw } from "../src/engine/sprite/resolve-sprite-draw";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";

const BSPRITE_URL = "/actor.bsprite";
const PNG_URL = "/actor.png";

const fakeImage = (w: number, h: number): TileSource =>
	({ width: w, height: h }) as unknown as TileSource;

/**
 * Minimal {@link AssetManager} stub: a `.bsprite` resolves through
 * `sprites.get` (the facade), a legacy PNG through `getImage`. `calls` records
 * which accessor each url reached so a test can assert the branch taken.
 */
const fakeAssets = (
	bsprite: SpriteAsset | undefined,
	png: TileSource | undefined,
): { assets: AssetManager; calls: string[] } => {
	const calls: string[] = [];
	const assets = {
		sprites: {
			get(url: string): SpriteAsset | undefined {
				calls.push(`sprites.get:${url}`);
				return bsprite;
			},
		},
		getImage(url: string): TileSource | undefined {
			calls.push(`getImage:${url}`);
			return png;
		},
	} as unknown as AssetManager;
	return { assets, calls };
};

describe("resolveSpriteDraw", () => {
	test("resolves a .bsprite through the facade sheet, not getImage", () => {
		const sheet = fakeImage(220, 55);
		const asset = {
			image: sheet,
			width: 55,
			contentRect: () => ({ x: 4, y: 6, width: 30, height: 40 }),
		} as unknown as SpriteAsset;
		const { assets, calls } = fakeAssets(asset, undefined);
		const sprite = new SpriteComponent(BSPRITE_URL);
		sprite.current = "idle";
		sprite.frame = 2;

		const draw = resolveSpriteDraw(sprite, assets);

		expect(draw).not.toBeNull();
		expect(draw!.image).toBe(sheet);
		expect(draw!.source.x).toBe(2 * 55 + 4);
		expect(draw!.source.y).toBe(6);
		expect(draw!.source.width).toBe(30);
		expect(draw!.source.height).toBe(40);
		expect(calls).toEqual([`sprites.get:${BSPRITE_URL}`]);
	});

	test("returns null while a .bsprite is still loading", () => {
		const { assets } = fakeAssets(undefined, undefined);
		const sprite = new SpriteComponent(BSPRITE_URL);

		expect(resolveSpriteDraw(sprite, assets)).toBeNull();
	});

	test("resolves a legacy PNG through getImage with the full-image rect", () => {
		const image = fakeImage(64, 48);
		const { assets, calls } = fakeAssets(undefined, image);
		const sprite = new SpriteComponent(PNG_URL);

		const draw = resolveSpriteDraw(sprite, assets);

		expect(draw).not.toBeNull();
		expect(draw!.image).toBe(image);
		expect(draw!.source).toEqual({
			url: PNG_URL,
			x: 0,
			y: 0,
			width: 64,
			height: 48,
		});
		expect(calls).toEqual([`getImage:${PNG_URL}`]);
	});

	test("returns null while a legacy PNG is still loading", () => {
		const { assets } = fakeAssets(undefined, undefined);
		const sprite = new SpriteComponent(PNG_URL);

		expect(resolveSpriteDraw(sprite, assets)).toBeNull();
	});
});
