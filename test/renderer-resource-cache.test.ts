import { describe, expect, test } from "bun:test";
import {
	type DisposableRenderer,
	RendererResourceCache,
} from "../src/engine/render/renderer-resource-cache";

/**
 * A stand-in for `Renderer2D` exposing only the `onDispose` hook the cache
 * depends on, so the per-renderer keying and disposal can be exercised without
 * a WebGL context.
 */
class FakeRenderer implements DisposableRenderer {
	private listeners: Array<() => void> = [];
	onDispose(listener: () => void): void {
		this.listeners.push(listener);
	}
	dispose(): void {
		for (const listener of this.listeners) {
			listener();
		}
		this.listeners = [];
	}
}

describe("RendererResourceCache", () => {
	test("keeps a distinct entry per renderer and reuses it", () => {
		let created = 0;
		const cache = new RendererResourceCache<
			{ id: number },
			FakeRenderer
		>(
			() => ({ id: created++ }),
			() => {},
		);
		const a = new FakeRenderer();
		const b = new FakeRenderer();

		const entryA = cache.get(a);
		const entryB = cache.get(b);

		expect(cache.size).toBe(2);
		expect(entryA).not.toBe(entryB);
		expect(cache.get(a)).toBe(entryA);
		expect(created).toBe(2);
	});

	test("dropping one renderer destroys and removes only its entry", () => {
		const destroyed: number[] = [];
		const cache = new RendererResourceCache<
			{ id: number },
			FakeRenderer
		>(
			(() => {
				let id = 0;
				return () => ({ id: id++ });
			})(),
			(value) => destroyed.push(value.id),
		);
		const a = new FakeRenderer();
		const b = new FakeRenderer();
		cache.get(a);
		const entryB = cache.get(b);

		a.dispose();

		expect(cache.size).toBe(1);
		expect(destroyed).toEqual([0]);
		expect(cache.get(b)).toBe(entryB);
	});
});
