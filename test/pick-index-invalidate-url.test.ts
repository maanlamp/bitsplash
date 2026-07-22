import { describe, expect, test } from "bun:test";
import type AssetManager from "../src/engine/assets";
import { pickEntityAt } from "../src/editor/pick";
import { getPickIndex } from "../src/editor/pick-index";
import { ECS } from "../src/engine/ecs";
import { SpriteComponent } from "../src/engine/sprite/sprite-component";
import { TransformComponent } from "../src/engine/transform-component";
import Vector2 from "../src/engine/vector2";

/**
 * A sprite whose backing image can be swapped for one of a different size,
 * standing in for a hot reload (save → evict → reload at new dimensions). Its
 * epoch never advances, so only an explicit invalidation can move the index —
 * isolating the url-invalidation path from the pending/epoch path.
 */
class ResizableAssetManager {
	private size = 16;
	getImage(): { width: number; height: number } | void {
		return { width: this.size, height: this.size };
	}
	get imageEpoch(): number {
		return 0;
	}
	resizeTo(size: number): void {
		this.size = size;
	}
}

const asAssetManager = (fake: ResizableAssetManager): AssetManager =>
	fake as unknown as AssetManager;

describe("PickIndex.invalidateUrl", () => {
	test("recomputes an entity's broad-phase bounds on the next poll after its url is invalidated", () => {
		const ecs = new ECS();
		const am = new ResizableAssetManager();
		const id = ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			new SpriteComponent("tile.png"),
		]);
		const index = getPickIndex(ecs);

		index.maintain(asAssetManager(am));
		// 16x16 sprite (half 8): (0, 0) hits, (24, 24) is outside.
		expect(
			pickEntityAt(ecs, new Vector2(0, 0), asAssetManager(am)),
		).toBe(id);
		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBeNull();

		// Image hot-reloaded larger. The broad-phase AABB is still the stale 16
		// box, so it excludes (24, 24) as a candidate — a plain maintain does not
		// notice (nothing marks the entity dirty, the epoch is unchanged).
		am.resizeTo(64);
		index.maintain(asAssetManager(am));
		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBeNull();

		// Invalidating the url flags the entity; the next poll recomputes its
		// broad-phase box to 64 (half 32), so (24, 24) now hits.
		index.invalidateUrl("tile.png");
		index.maintain(asAssetManager(am));
		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBe(id);
	});

	test("invalidating an unrelated url leaves the entity's index untouched", () => {
		const ecs = new ECS();
		const am = new ResizableAssetManager();
		ecs.createEntity([
			new TransformComponent(new Vector2(0, 0)),
			new SpriteComponent("tile.png"),
		]);
		const index = getPickIndex(ecs);
		index.maintain(asAssetManager(am));

		am.resizeTo(64);
		index.invalidateUrl("other.png");
		index.maintain(asAssetManager(am));

		// Unrelated invalidation did not recompute the broad-phase box: the stale
		// 16 box still excludes (24, 24).
		expect(
			pickEntityAt(ecs, new Vector2(24, 24), asAssetManager(am)),
		).toBeNull();
	});
});
