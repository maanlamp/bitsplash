import { describe, expect, test } from "bun:test";
import type AssetManager from "../src/engine/assets";
import { entityAabb, pickEntityAt } from "../src/editor/pick";
import { getPickIndex } from "../src/editor/pick-index";
import { ECS } from "../src/engine/ecs";
import { PhysicsBodyComponent } from "../src/engine/physics/physics-body-component";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";

// TILE_SIZE is 32, so the pre-load fallback box is 32x32 (half 16). A 64x64
// sprite at scale 1 yields a 64x64 box (half 32): a point at (24, 24) is inside
// the sprite's real bounds but outside the fallback — the discriminator below.
class FakeAssetManager {
	private ready = false;
	private epoch = 0;
	private readonly image = { width: 64, height: 64 };

	/** Simulate the sprite image finishing decoding (bumps the load epoch). */
	finishLoading(): void {
		this.ready = true;
		this.epoch += 1;
	}

	get imageEpoch(): number {
		return this.epoch;
	}

	getImage(): { width: number; height: number } | void {
		return this.ready ? this.image : undefined;
	}
}

const asAssetManager = (fake: FakeAssetManager): AssetManager =>
	fake as unknown as AssetManager;

const spriteEntity = (ecs: ECS): ReturnType<ECS["createEntity"]> =>
	ecs.createEntity([
		new TransformComponent(new Vector2(0, 0)),
		new SpriteComponent(),
	]);

describe("sprite entity pick bounds", () => {
	test("entityAabb is the tiny fallback before load, full sprite bounds after", () => {
		const ecs = new ECS();
		const am = new FakeAssetManager();
		const id = spriteEntity(ecs);

		const before = entityAabb(ecs, id, asAssetManager(am))!;
		expect(before.maxX - before.minX).toBe(32);
		expect(before.maxY - before.minY).toBe(32);

		am.finishLoading();
		const after = entityAabb(ecs, id, asAssetManager(am))!;
		expect(after.maxX - after.minX).toBe(64);
		expect(after.maxY - after.minY).toBe(64);
	});

	test("the pick index recomputes an entity's AABB once its sprite image loads", () => {
		const ecs = new ECS();
		const am = new FakeAssetManager();
		const id = spriteEntity(ecs);
		const index = getPickIndex(ecs);

		index.maintain(asAssetManager(am));
		// Only the fallback box (half 16) is hittable while the image loads.
		expect(pickEntityAt(ecs, new Vector2(0, 0), asAssetManager(am))).toBe(
			id,
		);
		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBeNull();

		// The image loads. Nothing marks the entity dirty — the index must
		// notice via the asset epoch and reindex the pending entity itself.
		am.finishLoading();
		index.maintain(asAssetManager(am));

		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBe(id);
	});

	test("once images have settled, maintain does no per-frame reindexing", () => {
		const ecs = new ECS();
		const am = new FakeAssetManager();
		am.finishLoading();
		spriteEntity(ecs);
		const index = getPickIndex(ecs);
		index.maintain(asAssetManager(am));

		const spy = index as unknown as {
			maintain: (am?: AssetManager) => void;
			reindex: (id: unknown, am?: unknown) => void;
		};
		let reindexes = 0;
		const original = spy.reindex.bind(spy);
		spy.reindex = (id: unknown, asset?: unknown) => {
			reindexes += 1;
			original(id, asset);
		};
		spy.maintain(asAssetManager(am));
		spy.maintain(asAssetManager(am));
		expect(reindexes).toBe(0);
	});

	test("pickEntityAt resolves through the index, not a live ECS scan", () => {
		const ecs = new ECS();
		ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			new PhysicsBodyComponent("static", 10, 10),
		]);
		// No maintain(): the index has not indexed the entity yet, so a live
		// scan would hit but an index-backed query misses.
		expect(pickEntityAt(ecs, new Vector2(0, 0))).toBeNull();

		getPickIndex(ecs).maintain();
		expect(pickEntityAt(ecs, new Vector2(0, 0))).not.toBeNull();
	});
});
