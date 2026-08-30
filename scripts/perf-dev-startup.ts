/**
 * Measures the number a developer actually feels: from the moment `bun dev`
 * would be typed to the **first contentful paint of the editor** inside the
 * real Electron window.
 *
 * This is deliberately a harness and not a test. Dev-startup wall-clock is not
 * locked behaviour — it moves whenever the toolchain does — so asserting a
 * threshold here would lock a number nobody has agreed to and flake on every
 * machine that is not this one. It reports; a human decides.
 *
 * Faithfulness to `bun dev` (`bun i && concurrently "vite" "electron ..."`):
 * Vite and Electron are started in parallel exactly as `concurrently` starts
 * them, against the same `src/desktop/main.cjs`, so Electron races the server
 * and exercises its own `did-fail-load` retry path. The `bun i
 * --frozen-lockfile` prefix is omitted: it measures 0.07s warm and would only
 * add constant noise.
 *
 * A run only counts once `#root` actually has children, so a config that never
 * renders the editor fails loudly instead of posting a spectacular number (see
 * {@link editorPaintedAt}).
 *
 * Playwright drives Electron rather than a raw debugging port because it needs
 * no instrumentation inside the app. It does attach a devtools client, so
 * absolute numbers carry a small constant overhead; the harness exists for
 * comparing variants, where that overhead cancels.
 *
 * Runs under Node, not Bun — the rest of this repo is Bun, but Playwright's
 * Electron launcher hangs indefinitely under Bun (it never spawns the Electron
 * process at all), while under Node it attaches in ~140ms. Node runs the file
 * directly by stripping the types.
 *
 * Usage:
 *   bun run perf --runs=7 --temp=warm --label=baseline
 *   bun run perf --runs=7 --temp=cold --json=out.json
 */
import {
	spawn,
	spawnSync,
	type ChildProcess,
} from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { _electron as electron } from "playwright";

/**
 * Everything a cold boot must not find. `node_modules/.vite` is Vite's own dep
 * optimizer output; `node_modules/.cache` holds any transform cache a plugin
 * keeps (the Babel decorator cache lives there). Missing one of these makes a
 * "cold" run silently warm, which flatters exactly the configs under test.
 */
const COLD_CACHES = ["node_modules/.vite", "node_modules/.cache"];
const READY_PATTERN = /ready in/i;
const LAUNCH_TIMEOUT_MS = 120_000;

/**
 * Dev-server port. Overridable so parallel experiments in separate worktrees
 * can measure at the same time without fighting over `strictPort`.
 */
const PORT = Number(
	process.argv.find((a) => a.startsWith("--port="))?.slice(7) ?? 5173,
);

/**
 * Give Electron a private profile instead of the one `bun dev` uses.
 *
 * Off by default, because Chromium's disk cache lives in the profile and a real
 * `bun dev` has a large warm one — source modules revalidate to a 304 in ~28ms
 * where an uncached fetch costs ~396ms, so a cold profile measures a browser
 * nobody has (it read ~4s slower here). Turn it on only to measure while
 * something else is using the real profile: `requestSingleInstanceLock()` is
 * keyed on userData, so an editor you already have open makes this Electron
 * quit at boot with no window and no error.
 */
const ISOLATE = process.argv.includes("--isolate");

type Phase = Readonly<{
	/** ms from t0 until Vite logged "ready in". */
	viteReady: number;
	/**
	 * ms from t0 until Playwright could attach to Electron's first window.
	 *
	 * This is NOT Electron's startup cost and must not be read as one — it is
	 * dominated by Playwright's CDP attach. Measured directly from inside
	 * `main.cjs`, process start to `loadURL` is ~186ms, while this reports
	 * ~1400ms. It is kept only as a coarse "the app came up" checkpoint.
	 */
	attachedToWindow: number;
	/** ms from t0 until the editor's first contentful paint. */
	firstPaint: number;
	/**
	 * ms from t0 until the game runtime is actually usable — the entry file
	 * marks `runtime-live` once registrations, the scene and Rapier are all in.
	 *
	 * Without this, deferring work off the first paint scores as a pure win
	 * when it may only have moved the cost behind an empty editor.
	 */
	runtimeLive: number;
}>;

const arg = (name: string, fallback: string): string =>
	process.argv
		.find((a) => a.startsWith(`--${name}=`))
		?.slice(name.length + 3) ?? fallback;

/** Kill a process and everything it spawned; Vite holds a strict port. */
const killTree = (child: ChildProcess): void => {
	if (child.pid === undefined || child.exitCode !== null) {
		return;
	}
	spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
		stdio: "ignore",
	});
};

const startVite = (): Readonly<{
	child: ChildProcess;
	ready: Promise<void>;
}> => {
	const child = spawn("bun", ["x", "vite", "--port", String(PORT)], {
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const ready = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("vite never reported ready")),
			LAUNCH_TIMEOUT_MS,
		);
		child.stdout?.on("data", (chunk: Buffer) => {
			if (READY_PATTERN.test(chunk.toString())) {
				clearTimeout(timer);
				resolve();
			}
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			reject(new Error(`vite exited early (code ${code})`));
		});
	});
	return { child, ready };
};

/**
 * Absolute epoch ms of the paint that actually showed the editor.
 *
 * Waiting on `first-contentful-paint` alone is not enough and silently lies:
 * while `main.cjs` is still racing the dev server it loads Chromium's error
 * page, and *that* paints. A broken config then measures as spectacularly fast
 * — a `bundledDev` trial reported 1.1s this way while the editor never
 * rendered at all. So the paint only counts once `#root` has children, and the
 * timestamp is read from that same document (`timeOrigin` resets per
 * navigation, so it is the successful load's own origin).
 */
const editorPaintedAt = (): Promise<number> =>
	new Promise<number>((resolve) => {
		const mounted = (): boolean => {
			const root = document.querySelector("#root");
			if (!root || root.childElementCount === 0) {
				return false;
			}
			const paint = performance.getEntriesByName(
				"first-contentful-paint",
			)[0];
			resolve(
				performance.timeOrigin +
					(paint?.startTime ?? performance.now()),
			);
			return true;
		};
		if (mounted()) {
			return;
		}
		new MutationObserver((_records, observer) => {
			if (mounted()) {
				observer.disconnect();
			}
		}).observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
	});

/**
 * Absolute epoch ms of the `runtime-live` mark set by the entry file.
 *
 * Read from the same document as the paint so both share a `timeOrigin`.
 */
const runtimeLiveAt = (): Promise<number> =>
	new Promise<number>((resolve) => {
		const read = (): boolean => {
			const mark = performance.getEntriesByName("runtime-live")[0];
			if (!mark) {
				return false;
			}
			resolve(performance.timeOrigin + mark.startTime);
			return true;
		};
		if (read()) {
			return;
		}
		const timer = setInterval(() => {
			if (read()) {
				clearInterval(timer);
			}
		}, 25);
	});

/**
 * Every child this process has started and not yet reaped.
 *
 * Without this, killing the harness mid-run orphans its Vite (and the Electron
 * it is about to launch), and an interrupted loop keeps opening windows with
 * nothing left to close them — which is exactly what happened once. Ctrl-C and
 * an uncaught throw both have to tear the tree down, not just `finally`.
 */
const live = new Set<ChildProcess>();

const killEverything = (): void => {
	for (const child of live) {
		killTree(child);
	}
	live.clear();
};

for (const signal of [
	"SIGINT",
	"SIGTERM",
	"SIGHUP",
	"SIGBREAK",
] as const) {
	process.on(signal, () => {
		killEverything();
		process.exit(130);
	});
}
process.on("exit", killEverything);
process.on("uncaughtException", (error) => {
	killEverything();
	throw error;
});

const measureOnce = async (): Promise<Phase> => {
	const t0 = Date.now();
	const vite = startVite();
	live.add(vite.child);
	let viteReady = Number.NaN;
	void vite.ready.then(() => {
		viteReady = Date.now() - t0;
	});

	const app = await electron.launch({
		args: ISOLATE
			? [
					"src/desktop/main.cjs",
					`--user-data-dir=${resolvePath(`.electron-userdata/port-${PORT}`)}`,
				]
			: ["src/desktop/main.cjs"],
		env: { ...process.env, VITE_DEV_PORT: String(PORT) },
		timeout: LAUNCH_TIMEOUT_MS,
	});
	try {
		const page = await app.firstWindow({
			timeout: LAUNCH_TIMEOUT_MS,
		});
		const attachedToWindow = Date.now() - t0;
		// The retry loader reloads while the server is still coming up, which
		// tears down the execution context mid-evaluate; retry until one sticks.
		const paintedAt = await (async (): Promise<number> => {
			for (let attempt = 0; attempt < 100; attempt++) {
				try {
					return await page.evaluate(editorPaintedAt);
				} catch {
					await page.waitForTimeout(100);
				}
			}
			throw new Error(
				"the editor never rendered — the config under test is broken, not fast",
			);
		})();
		const liveAt = await page.evaluate(runtimeLiveAt);
		return {
			viteReady,
			attachedToWindow,
			firstPaint: Math.round(paintedAt - t0),
			runtimeLive: Math.round(liveAt - t0),
		};
	} finally {
		await app.close();
		killTree(vite.child);
		live.delete(vite.child);
	}
};

const quantile = (sorted: ReadonlyArray<number>, q: number): number =>
	sorted[
		Math.min(sorted.length - 1, Math.floor(q * sorted.length))
	] ?? 0;

const report = (
	label: string,
	samples: ReadonlyArray<Phase>,
): void => {
	if (samples.length === 0) {
		console.log(`\n${label}: no runs`);
		return;
	}
	const column = (pick: (p: Phase) => number): string => {
		const sorted = samples.map(pick).toSorted((a, b) => a - b);
		return `${sorted[0]} / ${quantile(sorted, 0.5)} / ${quantile(sorted, 0.95)}`;
	};
	console.log(
		`\n${label}  (n=${samples.length}, min / p50 / p95 ms)`,
	);
	console.log(`  vite ready:   ${column((p) => p.viteReady)}`);
	console.log(
		`  attached:     ${column((p) => p.attachedToWindow)}  (Playwright CDP attach, not Electron startup)`,
	);
	console.log(`  FIRST PAINT:  ${column((p) => p.firstPaint)}`);
	console.log(`  runtime live: ${column((p) => p.runtimeLive)}`);
};

const main = async (): Promise<void> => {
	const runs = Number(arg("runs", "7"));
	const temp = arg("temp", "warm");
	const label = arg("label", temp);
	const json = arg("json", "");

	// One discarded run first: it pays for dep pre-bundling and, on a fresh
	// clone, mkcert's certificate generation, neither of which a developer
	// hits on a normal `bun dev`.
	if (temp === "warm") {
		await measureOnce();
	}

	const samples: Phase[] = [];
	for (let run = 0; run < runs; run++) {
		if (temp === "cold") {
			for (const dir of COLD_CACHES) {
				await rm(dir, { recursive: true, force: true });
			}
		}
		samples.push(await measureOnce());
		console.log(
			`run ${run + 1}/${runs}: paint ${samples.at(-1)?.firstPaint}ms, live ${samples.at(-1)?.runtimeLive}ms`,
		);
	}

	report(`${label} (${temp})`, samples);
	if (json) {
		await writeFile(
			json,
			JSON.stringify({ label, temp, samples }, null, "\t"),
		);
	}
};

await main();
