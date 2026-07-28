import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import type { SpriteAsset } from "../src/engine/sprite/sprite-asset";
import { SpriteHotReloadFixture } from "./support/sequence-harness";

const BUBBLE_URL = "/src/game/content/assets/bubble.bsprite";
const PLAYER_URL = "/src/game/content/assets/player.bsprite";

/** The 9-slice insets `scripts/gen-bubble-sprite.ts` bakes into the archive. */
const BUBBLE_INSETS = {
	left: 4,
	right: 4,
	top: 4,
	bottom: 4,
	gap: 0,
};

/** Name of the one-frame portrait tag appended to `player.bsprite`. */
const PORTRAIT_TAG = "portrait";

/**
 * Load a committed archive off disk through the real sprite facade, with only the
 * two DOM-bound steps replaced (see {@link SpriteHotReloadFixture}). Asserting
 * against the shipped bytes is the point: a generator or an editor re-save that
 * loses the insets or splits the frame fails here.
 */
const load = (url: string, tag?: string): Promise<SpriteAsset> =>
	new SpriteHotReloadFixture({
		url,
		loadBytes: async () =>
			new Uint8Array(readFileSync(`${import.meta.dir}/..${url}`)),
		tag,
	}).load();

describe("bubble.bsprite", () => {
	test("is a single frame, so 9-slicing measures the sheet correctly", async () => {
		const asset = await load(BUBBLE_URL);

		expect(asset.frameCount).toBe(1);
		expect(asset.width).toBe(16);
		expect(asset.height).toBe(16);
		expect(asset.image.width).toBe(asset.width);
	});

	test("carries the 9-slice insets in its manifest", async () => {
		const asset = await load(BUBBLE_URL);

		expect(asset.slice()).toEqual(BUBBLE_INSETS);
	});

	test("leaves a stretchable middle band inside its insets", async () => {
		const asset = await load(BUBBLE_URL);
		const insets = asset.slice()!;

		expect(
			asset.width - insets.left - insets.right - 1,
		).toBeGreaterThan(0);
	});
});

describe("player.bsprite portrait tag", () => {
	test("crops one frame appended after the animated ones", async () => {
		const asset = await load(PLAYER_URL, PORTRAIT_TAG);
		const manifest = asset.spriteManifest!;
		const tag = manifest.tags.find(
			(candidate) => candidate.name === PORTRAIT_TAG,
		);

		expect(tag).toEqual({
			name: PORTRAIT_TAG,
			from: manifest.frames.length - 1,
			to: manifest.frames.length - 1,
			loop: false,
		});
	});

	test("has a content rect inside the shared 55x55 canvas", async () => {
		const asset = await load(PLAYER_URL, PORTRAIT_TAG);
		const rect = asset.contentRect(PORTRAIT_TAG);

		expect(asset.width).toBe(55);
		expect(asset.height).toBe(55);
		expect(rect.width).toBeLessThanOrEqual(55);
		expect(rect.height).toBeLessThanOrEqual(55);
		expect(rect).not.toEqual(asset.contentRect("idle"));
	});

	test("keeps every grip attachment on its original frame index", async () => {
		const asset = await load(PLAYER_URL, PORTRAIT_TAG);

		expect(asset.attachment("grip", 0)).toEqual({
			x: 24.346153846153847,
			y: 31.5,
		});
		expect(asset.attachment("grip", 31)).toEqual({
			x: 23.215686274509803,
			y: 40.705882352941174,
		});
	});
});
