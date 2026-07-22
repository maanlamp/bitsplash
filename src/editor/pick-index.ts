import RBush from "rbush";
import type AssetManager from "../engine/assets";
import type { EntityId, ReadonlyECS } from "../engine/ecs";
import {
	type EntityAabb,
	entityAabb,
	spriteImagePending,
	spriteImageUrlOf,
} from "./pick";

type SubscribableEcs = ReadonlyECS &
	Readonly<{ subscribe: (listener: () => void) => () => void }>;

type Item = EntityAabb & Readonly<{ id: EntityId }>;

/**
 * A per-world spatial index over entity {@link import("./pick").EntityAabb}s: an
 * `rbush` R-tree broad-phase for picking and marquee queries (plan C2).
 *
 * The ECS emits no field-mutation event, so the index cannot observe a silent
 * transform/sprite write. It stays correct two ways: it subscribes to the ECS's
 * structural notifications (create/add/remove) to catch churn, and the systems
 * that mutate geometry silently (drag, nudge, inspector commit) call
 * {@link markDirty}. {@link maintain} then recomputes AABBs for the affected
 * entities only — never the whole world per frame — so an idle hover is a pure
 * broad-phase query with no geometry recompute.
 *
 * A sprite's true bounds are unknown until its image loads, and an image load
 * marks no entity dirty. Entities whose sprite image is still loading are held
 * as {@link pending} with a provisional (fallback) AABB and reindexed once the
 * {@link AssetManager}'s image epoch advances — so bounds snap to the sprite's
 * real size the frame after it loads, without a per-frame recompute.
 */
export class PickIndex {
	private readonly tree = new RBush<Item>();
	private readonly items = new Map<EntityId, Item>();
	private readonly dirty = new Set<EntityId>();
	private readonly pending = new Set<EntityId>();
	private readonly dirtyUrls = new Set<string>();
	private imageEpoch = 0;
	private structureDirty = true;
	private readonly unsubscribe: () => void;

	constructor(private readonly ecs: ReadonlyECS) {
		this.unsubscribe = (ecs as SubscribableEcs).subscribe(() => {
			this.structureDirty = true;
		});
	}

	/** Flag an entity whose geometry changed silently for reindex next frame. */
	markDirty(id: EntityId): void {
		this.dirty.add(id);
	}

	/**
	 * Flag every entity whose sprite resolves to `url` for reindex on the next
	 * {@link maintain}, so an evicted/hot-reloaded image's derived bounds are
	 * recomputed even though the image load marks no entity dirty. Matches the
	 * epoch-poll pattern: the recompute happens on the next poll, not eagerly.
	 * The editor save path calls this alongside
	 * {@link import("../engine/assets").default.evict} for each open view's index.
	 */
	invalidateUrl(url: string): void {
		this.dirtyUrls.add(url);
	}

	/**
	 * Bring the index up to date. On a structural change it reconciles membership
	 * (drops destroyed entities, reindexes everything present so component
	 * add/remove is reflected); otherwise it reindexes only the entities marked
	 * dirty since the last frame.
	 */
	maintain(assetManager?: AssetManager): void {
		if (this.structureDirty) {
			this.reconcileMembership();
			this.structureDirty = false;
		}
		const epoch = assetManager?.imageEpoch ?? 0;
		if (epoch !== this.imageEpoch) {
			this.imageEpoch = epoch;
			for (const id of this.pending) {
				this.dirty.add(id);
			}
		}
		if (this.dirtyUrls.size > 0) {
			for (const id of this.items.keys()) {
				const url = spriteImageUrlOf(this.ecs, id);
				if (url !== null && this.dirtyUrls.has(url)) {
					this.dirty.add(id);
				}
			}
			this.dirtyUrls.clear();
		}
		if (this.dirty.size === 0) {
			return;
		}
		for (const id of this.dirty) {
			this.reindex(id, assetManager);
		}
		this.dirty.clear();
	}

	/** The ids whose AABB intersects `bbox` (broad-phase, no narrow test). */
	search(bbox: EntityAabb): ReadonlyArray<EntityId> {
		return this.tree.search(bbox).map((item) => item.id);
	}

	dispose(): void {
		this.unsubscribe();
	}

	private reconcileMembership(): void {
		const current = new Set(this.ecs.entities());
		const gone: EntityId[] = [];
		for (const id of this.items.keys()) {
			if (!current.has(id)) {
				gone.push(id);
			}
		}
		for (const id of gone) {
			this.removeItem(id);
		}
		for (const id of current) {
			this.dirty.add(id);
		}
	}

	private reindex(id: EntityId, assetManager?: AssetManager): void {
		this.removeItem(id);
		if (spriteImagePending(this.ecs, id, assetManager)) {
			this.pending.add(id);
		} else {
			this.pending.delete(id);
		}
		const aabb = entityAabb(this.ecs, id, assetManager);
		if (!aabb) {
			return;
		}
		const item: Item = { ...aabb, id };
		this.items.set(id, item);
		this.tree.insert(item);
	}

	private removeItem(id: EntityId): void {
		this.pending.delete(id);
		const item = this.items.get(id);
		if (item) {
			this.tree.remove(item);
			this.items.delete(id);
		}
	}
}

const indices = new WeakMap<ReadonlyECS, PickIndex>();
const liveIndices = new Set<PickIndex>();

/** The {@link PickIndex} for a world's ECS, created (and bound) on first use. */
export const getPickIndex = (ecs: ReadonlyECS): PickIndex => {
	let index = indices.get(ecs);
	if (!index) {
		index = new PickIndex(ecs);
		indices.set(ecs, index);
		liveIndices.add(index);
	}
	return index;
};

/**
 * Dispose a world's {@link PickIndex} (unsubscribe from the ECS) and drop it from
 * the live set. Called from a view's `dispose` so a closed view's index is not
 * iterated by {@link invalidateUrlEverywhere} and its ECS subscription is freed.
 */
export const disposePickIndex = (ecs: ReadonlyECS): void => {
	const index = indices.get(ecs);
	if (!index) {
		return;
	}
	index.dispose();
	indices.delete(ecs);
	liveIndices.delete(index);
};

/**
 * Flag every live index's entities that resolve to `url` for reindex, so an
 * evicted/hot-reloaded sprite's derived bounds recompute in **every** open view
 * (the editor runs one index per scene-view world). The editor save path calls
 * this alongside {@link import("../engine/assets").default.evict} and the
 * renderer-registry image/tile-array invalidation.
 */
export const invalidateUrlEverywhere = (url: string): void => {
	for (const index of liveIndices) {
		index.invalidateUrl(url);
	}
};
