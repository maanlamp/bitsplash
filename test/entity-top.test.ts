import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import AssetManager from "../src/engine/assets";
import { ECS } from "../src/engine/ecs";
import { entityTop } from "../src/engine/sprite/entity-top";
import {
	SpriteComponent,
	spriteImageUrl,
} from "../src/engine/sprite/sprite-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";
import { headlessSheetComposer } from "./support/sequence-harness";

const URL_PATH = "/src/game/content/assets/player.bsprite";

const BYTES = new Uint8Array(
	readFileSync(`${import.meta.dir}/..${URL_PATH}`),
);

/** Content-rect heights baked into `player.bsprite`, asserted below. */
const IDLE_HEIGHT = 33;
const FALL_HEIGHT = 36;
const GAP = 4;
const Y = 100;

/**
 * A `.bsprite` archive is a zip, so `loadImage` can never decode it — the
 * measurement path `entityTop` replaces reached for exactly this and always got
 * nothing. Rejecting here reproduces that without a DOM.
 */
const assetManager = (): AssetManager =>
	new AssetManager(
		() => Promise.reject(new Error("not a decodable image")),
		() => Promise.resolve(BYTES),
		headlessSheetComposer,
	);

const flush = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

const settled = async (assets: AssetManager): Promise<void> => {
	for (let i = 0; i < 50; i++) {
		if (assets.sprites.get(URL_PATH)) {
			return;
		}
		await flush();
	}
	throw new Error(`${URL_PATH} did not load within budget`);
};

const scene = (
	tag: string,
	scaleY = 1,
): {
	ecs: ECS;
	assets: AssetManager;
	id: ReturnType<ECS["createEntity"]>;
	sprite: SpriteComponent;
} => {
	const ecs = new ECS();
	const sprite = new SpriteComponent(URL_PATH);
	sprite.current = tag;
	const transform = new TransformComponent(new Vector2(0, Y));
	transform.scale = new Vector2(1, scaleY);
	const id = ecs.createEntity([transform, sprite]);
	return { ecs, assets: assetManager(), id, sprite };
};

describe("entityTop", () => {
	test("anchors to a .bsprite's content rect, which getImage cannot measure", async () => {
		const { ecs, assets, id, sprite } = scene("idle");
		await settled(assets);

		expect(
			assets.sprites.get(URL_PATH)!.contentRect("idle").height,
		).toBe(IDLE_HEIGHT);
		expect(assets.getImage(spriteImageUrl(sprite))).toBeUndefined();

		expect(entityTop(ecs, assets, id, GAP)).toBe(
			Y - IDLE_HEIGHT / 2 - GAP,
		);
	});

	test("tracks the current tag's content rect", async () => {
		const { ecs, assets, id, sprite } = scene("idle");
		await settled(assets);

		sprite.current = "fall";

		expect(entityTop(ecs, assets, id, GAP)).toBe(
			Y - FALL_HEIGHT / 2 - GAP,
		);
	});

	test("scales the content height by the transform's y scale", async () => {
		const { ecs, assets, id } = scene("idle", 2);
		await settled(assets);

		expect(entityTop(ecs, assets, id, GAP)).toBe(
			Y - IDLE_HEIGHT - GAP,
		);
	});

	test("is null while the sprite asset is still loading", () => {
		const { ecs, assets, id } = scene("idle");

		expect(entityTop(ecs, assets, id, GAP)).toBeNull();
	});

	test("is null for an entity with no sprite, leaving the caller its fallback", () => {
		const ecs = new ECS();
		const id = ecs.createEntity([
			new TransformComponent(new Vector2(0, Y)),
		]);

		expect(entityTop(ecs, assetManager(), id, GAP)).toBeNull();
	});
});
