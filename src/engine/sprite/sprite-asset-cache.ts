import type AssetManager from "../assets";
import { SpriteAsset } from "./sprite-asset";

type Entry = Readonly<
	| { status: "loading" }
	| { status: "ready"; data: SpriteAsset }
	| { status: "error"; error: Error }
>;

/**
 * True when a URL/path names a `.bsprite` asset (tolerating a trailing query or
 * fragment). This extension check is the single classifier the engine uses to
 * pick tag-playback over the legacy `SpriteClip` path — keep it centralized.
 */
export const isBspriteUrl = (url: string): boolean =>
	/\.bsprite(\?|#|$)/i.test(url);

/**
 * Per-URL cache and loader for {@link SpriteAsset} — the engine's single
 * accessor for sprite pixels + metadata across both `.bsprite` and legacy PNG.
 *
 * Loading is status-polled like {@link AssetManager.getImage}: {@link get}
 * returns `undefined` while a load is in flight (or errored) and the asset once
 * ready, so render systems may call it every frame. `.bsprite` archives are
 * fetched, unzipped and composed once and cached; legacy PNGs delegate to the
 * owning {@link AssetManager} (shared image + `iTXt` metadata cache).
 *
 * Owns its own cache with an {@link evict} hook for hot reload, guarding against
 * stale in-flight loads resurrecting an evicted entry via a per-URL generation
 * counter. {@link import("../assets").default.evict} fans out to this hook so a
 * URL's image, metadata and `.bsprite` entries always evict together.
 *
 * @example
 * const asset = assetManager.sprites.get(url);
 * if (asset) renderer.drawImage(layer, asset.image, { ... });
 */
export class SpriteAssetCache {
	private readonly cache = new Map<string, Entry>();
	private readonly generation = new Map<string, number>();

	constructor(private readonly assets: AssetManager) {}

	/**
	 * Poll for the loaded asset, kicking off a load on first request. Returns
	 * `undefined` while loading or on error.
	 */
	get(url: string): SpriteAsset | undefined {
		return isBspriteUrl(url)
			? this.getBsprite(url)
			: this.getLegacy(url);
	}

	/**
	 * Drop the cached entry for a URL so the next {@link get} reloads it, and
	 * invalidate any in-flight load so it cannot resurrect the evicted entry.
	 */
	evict(url: string): void {
		this.cache.delete(url);
		this.generation.set(url, (this.generation.get(url) ?? 0) + 1);
	}

	private getBsprite(url: string): SpriteAsset | undefined {
		const entry = this.cache.get(url);
		if (entry) {
			return entry.status === "ready" ? entry.data : undefined;
		}
		const token = (this.generation.get(url) ?? 0) + 1;
		this.generation.set(url, token);
		this.cache.set(url, { status: "loading" });
		void this.assets
			.loadBspriteAsset(url)
			.then((data) =>
				this.settle(url, token, { status: "ready", data }),
			)
			.catch((error: unknown) =>
				this.settle(url, token, {
					status: "error",
					error:
						error instanceof Error ? error : new Error(String(error)),
				}),
			);
		return undefined;
	}

	private getLegacy(url: string): SpriteAsset | undefined {
		const ready = this.cache.get(url);
		if (ready?.status === "ready") {
			return ready.data;
		}
		const image = this.assets.getImage(url);
		if (!image) {
			return undefined;
		}
		const data = SpriteAsset.legacy(url, image);
		this.cache.set(url, { status: "ready", data });
		return data;
	}

	private settle(url: string, token: number, entry: Entry): void {
		if (this.generation.get(url) === token) {
			this.cache.set(url, entry);
		}
	}
}
