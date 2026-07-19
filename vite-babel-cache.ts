import { createHash } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import babel from "@rolldown/plugin-babel";

type BabelOptions = Parameters<typeof babel>[0];
type BabelPlugin = Awaited<ReturnType<typeof babel>>;
type TransformResult = { code?: string; map?: unknown };
type BabelHandler = (
	this: { environment?: { name?: string } },
	code: string,
	id: string,
	opts?: { moduleType?: string },
) =>
	| Promise<TransformResult | undefined>
	| TransformResult
	| undefined;

/**
 * Bump to invalidate every cached entry when this plugin's own logic or the
 * cached payload shape changes (independent of dependency versions).
 */
const CACHE_VERSION = "1";
const CACHE_DIR = resolve("node_modules/.cache/bitsplash-babel");

/**
 * A stable salt covering everything that changes Babel's output besides the
 * source itself: the plugin versions on the hot path and the exact options we
 * pass (decorator version, React-compiler preset, engine/ui exclude). Any of
 * these changing invalidates the whole cache by producing a new salt.
 */
const computeSalt = (options: BabelOptions): string => {
	const pkgs = [
		"@babel/core",
		"@babel/plugin-proposal-decorators",
		"babel-plugin-react-compiler",
		"@vitejs/plugin-react",
		"@rolldown/plugin-babel",
	];
	const versions = pkgs.map((p) => {
		try {
			const json = readFileSync(
				resolve("node_modules", p, "package.json"),
				"utf8",
			);
			return `${p}@${(JSON.parse(json) as { version: string }).version}`;
		} catch {
			return `${p}@?`;
		}
	});
	const optionsKey = JSON.stringify(options, (_k, v) =>
		typeof v === "function"
			? v.toString()
			: v instanceof RegExp
				? v.source
				: v,
	);
	return createHash("sha256")
		.update(`${CACHE_VERSION}\0${versions.join("\0")}\0${optionsKey}`)
		.digest("hex")
		.slice(0, 16);
};

/**
 * Wrap {@link babel `@rolldown/plugin-babel`} with a content-addressed on-disk
 * cache so warm dev boots skip the (single-threaded, slow) Babel pass —
 * decorators + React Compiler — for every unchanged file. Vite persistently
 * caches only dependency pre-bundling, never first-party `src` transforms, so a
 * server restart re-runs Babel on all ~500 first-paint modules; this makes that
 * a near-free cache read instead.
 *
 * Correctness is by construction: the key hashes the source, the module id, the
 * environment/module-type the handler branches on, and a salt of the toolchain
 * versions + Babel options ({@link computeSalt}). Any change to source, deps, or
 * config yields a new key, so a stale hit is unrepresentable. Writes are
 * temp-then-rename so a crash mid-write can't leave a torn entry (a corrupt read
 * simply degrades to a miss). Best-effort throughout: any cache I/O failure
 * falls back to running Babel.
 */
export const cachedBabel = async (
	options: BabelOptions,
): Promise<BabelPlugin> => {
	const plugin = await babel(options);
	const transform = plugin.transform as unknown as {
		filter?: unknown;
		handler: BabelHandler;
	};
	const salt = computeSalt(options);
	try {
		mkdirSync(CACHE_DIR, { recursive: true });
	} catch {
		return plugin;
	}
	let counter = 0;
	const inner = transform.handler;
	transform.handler = async function (
		this: { environment?: { name?: string } },
		code: string,
		id: string,
		opts?: { moduleType?: string },
	) {
		const env = this.environment?.name ?? "";
		const moduleType = opts?.moduleType ?? "js";
		const key = createHash("sha256")
			.update(`${salt}\0${env}\0${moduleType}\0${id}\0${code}`)
			.digest("hex");
		const file = join(CACHE_DIR, `${key}.json`);
		try {
			return JSON.parse(
				readFileSync(file, "utf8"),
			) as TransformResult;
		} catch {
			// miss (or torn entry) — fall through to Babel
		}
		const result = await inner.call(this, code, id, opts);
		if (result?.code != null) {
			try {
				const tmp = `${file}.${process.pid}.${counter++}.tmp`;
				writeFileSync(tmp, JSON.stringify(result));
				renameSync(tmp, file);
			} catch {
				// best-effort: a failed write just means a miss next time
			}
		}
		return result;
	};
	return plugin;
};
