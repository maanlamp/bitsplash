import { describe, expect, test } from "bun:test";
import type AssetManager from "../src/engine/assets";
import { ECS } from "../src/engine/ecs";
import type { BspriteManifest } from "../src/engine/sprite/bsprite-manifest";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";
import { SpriteTagPlaybackSystem } from "../src/engine/sprite/sprite-tag-playback-system";
import type { UpdateContext } from "../src/engine/system";

const URL = "test.bsprite";

type Tag = BspriteManifest["tags"][number];

const manifest = (
	durations: readonly number[],
	tags: readonly Tag[],
): BspriteManifest => ({
	version: 1,
	width: 16,
	height: 16,
	layers: [],
	frames: durations.map((duration) => ({ duration })),
	cels: [],
	tags,
});

/**
 * A synthetic asset manager whose sprite facade returns a fixed manifest for the
 * `.bsprite` URL under test — enough surface for the playback system, no real
 * archive or canvas decode.
 */
const fakeAssets = (m: BspriteManifest | null): AssetManager =>
	({
		sprites: {
			get: (url: string) =>
				url === URL && m ? { spriteManifest: m } : undefined,
		},
	}) as unknown as AssetManager;

const step = (
	system: SpriteTagPlaybackSystem,
	ecs: ECS,
	assets: AssetManager,
	dt: number,
): void => {
	system.update({ dt, ecs, assetManager: assets } as UpdateContext);
};

const setup = (
	m: BspriteManifest | null,
	current: string,
): {
	system: SpriteTagPlaybackSystem;
	ecs: ECS;
	assets: AssetManager;
	sprite: SpriteComponent;
} => {
	const ecs = new ECS();
	const sprite = new SpriteComponent(URL);
	sprite.current = current;
	ecs.createEntity([sprite]);
	return {
		system: new SpriteTagPlaybackSystem(),
		ecs,
		assets: fakeAssets(m),
		sprite,
	};
};

describe("SpriteTagPlaybackSystem", () => {
	test("looping tag advances by per-frame durations and wraps", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[50, 200],
				[{ name: "run", from: 0, to: 1, loop: true }],
			),
			"run",
		);

		step(system, ecs, assets, 0);
		expect(sprite.playing).toBe("run");
		expect(sprite.frame).toBe(0);

		step(system, ecs, assets, 49);
		expect(sprite.frame).toBe(0);

		step(system, ecs, assets, 1);
		expect(sprite.frame).toBe(1);

		step(system, ecs, assets, 199);
		expect(sprite.frame).toBe(1);

		step(system, ecs, assets, 1);
		expect(sprite.frame).toBe(0);
		expect(sprite.finished).toBe(false);
	});

	test("frame is the absolute manifest index within [from, to]", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[100, 100, 100, 100],
				[{ name: "tail", from: 2, to: 3, loop: true }],
			),
			"tail",
		);

		step(system, ecs, assets, 0);
		expect(sprite.frame).toBe(2);

		step(system, ecs, assets, 100);
		expect(sprite.frame).toBe(3);

		step(system, ecs, assets, 100);
		expect(sprite.frame).toBe(2);
	});

	test("non-looping tag clamps at last frame and sets finished", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[100, 100, 100],
				[{ name: "land", from: 0, to: 2, loop: false }],
			),
			"land",
		);

		step(system, ecs, assets, 0);
		step(system, ecs, assets, 100);
		expect(sprite.frame).toBe(1);
		expect(sprite.finished).toBe(false);

		step(system, ecs, assets, 100);
		expect(sprite.frame).toBe(2);
		expect(sprite.finished).toBe(true);

		step(system, ecs, assets, 100000);
		expect(sprite.frame).toBe(2);
		expect(sprite.finished).toBe(true);
	});

	test("changing current resets frame, elapsed and finished", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[100, 100, 100, 100, 100],
				[
					{ name: "land", from: 0, to: 2, loop: false },
					{ name: "idle", from: 3, to: 4, loop: true },
				],
			),
			"land",
		);

		step(system, ecs, assets, 0);
		step(system, ecs, assets, 100);
		step(system, ecs, assets, 100);
		expect(sprite.frame).toBe(2);
		expect(sprite.finished).toBe(true);

		sprite.current = "idle";
		step(system, ecs, assets, 0);
		expect(sprite.playing).toBe("idle");
		expect(sprite.frame).toBe(3);
		expect(sprite.elapsed).toBe(0);
		expect(sprite.finished).toBe(false);
	});

	test("a 1-frame tag does not animate and does not crash", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[100, 100, 100],
				[{ name: "hold", from: 2, to: 2, loop: true }],
			),
			"hold",
		);

		step(system, ecs, assets, 0);
		expect(sprite.frame).toBe(2);

		step(system, ecs, assets, 100000);
		expect(sprite.frame).toBe(2);
		expect(sprite.finished).toBe(false);
	});

	test("an absent tag does not animate and does not crash", () => {
		const { system, ecs, assets, sprite } = setup(
			manifest(
				[100, 100],
				[{ name: "run", from: 0, to: 1, loop: true }],
			),
			"missing",
		);

		expect(() => step(system, ecs, assets, 100000)).not.toThrow();
		expect(sprite.frame).toBe(0);
		expect(sprite.playing).toBe("");
	});

	test("an unloaded / non-bsprite asset is left untouched", () => {
		const { system, ecs, assets, sprite } = setup(null, "run");
		expect(() => step(system, ecs, assets, 100)).not.toThrow();
		expect(sprite.frame).toBe(0);
		expect(sprite.playing).toBe("");
	});
});
