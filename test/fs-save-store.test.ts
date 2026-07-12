import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fsSaveStoreImpl } from "../src/desktop/fs-save-store.cjs";

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "bitsplash-saves-"));
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

test("list on a missing saves directory returns empty (no throw)", async () => {
	const store = fsSaveStoreImpl(join(dir, "does-not-exist-yet"));
	expect(await store.list()).toEqual([]);
	expect(await store.read("nothing")).toBeUndefined();
});

test("write creates the directory, read returns the exact bytes", async () => {
	const target = join(dir, "created-on-write");
	const store = fsSaveStoreImpl(target);
	const bytes = new Uint8Array([1, 2, 3, 250, 0, 42]);

	await store.write("auto__100__", bytes);

	expect(await store.list()).toEqual(["auto__100__"]);
	const read = await store.read("auto__100__");
	expect(read).toBeDefined();
	expect([...read!]).toEqual([...bytes]);
});

test("list reflects multiple slots and delete removes only the target", async () => {
	const store = fsSaveStoreImpl(join(dir, "multi"));
	await store.write("auto__1__", new Uint8Array([1]));
	await store.write("quick__2__", new Uint8Array([2]));
	await store.write("manual__3__Alpha", new Uint8Array([3]));

	expect((await store.list()).sort()).toEqual([
		"auto__1__",
		"manual__3__Alpha",
		"quick__2__",
	]);

	await store.delete("quick__2__");
	expect((await store.list()).sort()).toEqual([
		"auto__1__",
		"manual__3__Alpha",
	]);

	await store.delete("quick__2__");
});
