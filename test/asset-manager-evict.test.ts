import { describe, expect, test } from "bun:test";
import AssetManager from "../src/engine/assets";

/** Flush pending microtasks (and the macrotask queue) so settled loads land. */
const tick = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

const fakeImage = (naturalWidth: number): HTMLImageElement =>
	({ naturalWidth }) as unknown as HTMLImageElement;

describe("AssetManager.evict", () => {
	test("clears the image and facade entries together and bumps imageEpoch", () => {
		const am = new AssetManager(async () => fakeImage(1));
		am.assets.set("a.png", { status: "ready", data: fakeImage(4) });
		let evicted = "";
		(
			am.sprites as unknown as { evict: (url: string) => void }
		).evict = (url: string) => {
			evicted = url;
		};

		const before = am.imageEpoch;
		am.evict("a.png");

		expect(am.assets.has("a.png")).toBe(false);
		expect(evicted).toBe("a.png");
		expect(am.imageEpoch).toBe(before + 1);
	});

	test("an in-flight load evicted mid-flight cannot resurrect the entry", async () => {
		const resolvers: Array<(image: HTMLImageElement) => void> = [];
		const am = new AssetManager(
			() =>
				new Promise<HTMLImageElement>((resolve) => {
					resolvers.push(resolve);
				}),
		);

		// First poll starts load #1.
		expect(am.getImage("a.png")).toBeUndefined();
		// Evict mid-flight, then poll again: load #2 starts under a new token.
		am.evict("a.png");
		expect(am.getImage("a.png")).toBeUndefined();
		expect(resolvers).toHaveLength(2);

		// The stale load #1 resolves — its result must be dropped.
		resolvers[0]!(fakeImage(1));
		await tick();
		expect(am.getImage("a.png")).toBeUndefined();

		// The fresh load #2 resolves and populates the cache.
		const fresh = fakeImage(2);
		resolvers[1]!(fresh);
		await tick();
		expect(am.getImage("a.png")).toBe(fresh);
	});

	test("an errored entry becomes retryable after evict", async () => {
		let attempt = 0;
		const am = new AssetManager(async () => {
			attempt += 1;
			if (attempt === 1) {
				throw new Error("boom");
			}
			return fakeImage(7);
		});

		expect(am.getImage("a.png")).toBeUndefined();
		await tick();
		// Errored entry is sticky: a re-poll does not retry.
		expect(am.getImage("a.png")).toBeUndefined();
		expect(attempt).toBe(1);

		// Evict clears the errored entry so the next poll retries.
		am.evict("a.png");
		expect(am.getImage("a.png")).toBeUndefined();
		await tick();
		expect(attempt).toBe(2);
		expect(am.getImage("a.png")).toBe(am.getImage("a.png"));
		expect(
			(am.getImage("a.png") as HTMLImageElement).naturalWidth,
		).toBe(7);
	});

	test("a successful load populates the cache and bumps imageEpoch", async () => {
		const am = new AssetManager(async () => fakeImage(9));
		const before = am.imageEpoch;
		expect(am.getImage("a.png")).toBeUndefined();
		await tick();
		expect(
			(am.getImage("a.png") as HTMLImageElement).naturalWidth,
		).toBe(9);
		expect(am.imageEpoch).toBe(before + 1);
	});
});
